import Foundation
import CryptoKit
import Security
import React

private struct OtaManifest: Decodable {
  let schemaVersion: Int
  let platform: String
  let brandId: String
  let environment: String
  let channel: String
  let appVersion: String
  let buildNumber: Int
  let baseVersion: String
  let nativeFingerprint: String
  let assetsFingerprint: String
  let runtimeVersion: String
  let bundleVersion: Int
  let businessSha256: String
  let businessBytes: Int
  let businessUrl: String?

  var compatibility: [String] {
    [String(schemaVersion), platform, brandId, environment, channel, appVersion,
     String(buildNumber), baseVersion, nativeFingerprint, assetsFingerprint, runtimeVersion]
  }
}

private struct OtaState: Codable {
  var current = 0
  var pending = 0
  var previous = 0
  var trial = 0
  var highest = 0
  var failed = 0
}

private func otaError(_ message: String) -> NSError {
  NSError(domain: "OtaBundle", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
}

// Bound both memory and total download time, including chunked responses.
private final class OtaDownload: NSObject, URLSessionDataDelegate, @unchecked Sendable {
  private let limit: Int
  private let completed = DispatchSemaphore(value: 0)
  private var bytes = Data()
  private var failure: Error?

  init(limit: Int) { self.limit = limit }

  func fetch(_ address: String) throws -> Data {
    guard let url = URL(string: address), url.scheme == "https", url.host != nil,
          url.user == nil, url.password == nil, url.fragment == nil else {
      throw otaError("OTA requires HTTPS")
    }
    let configuration = URLSessionConfiguration.ephemeral
    configuration.timeoutIntervalForRequest = 30
    configuration.timeoutIntervalForResource = 60
    let session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
    session.dataTask(with: url).resume()
    completed.wait()
    session.finishTasksAndInvalidate()
    if let failure { throw failure }
    return bytes
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                  completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
    guard (response as? HTTPURLResponse)?.statusCode == 200, response.expectedContentLength <= Int64(limit) else {
      failure = otaError("Invalid OTA response or size")
      completionHandler(.cancel)
      return
    }
    completionHandler(.allow)
  }

  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    guard bytes.count + data.count <= limit else {
      failure = otaError("OTA download too large")
      dataTask.cancel()
      return
    }
    bytes.append(data)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                  newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
    completionHandler(nil)
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    if failure == nil { failure = error }
    completed.signal()
  }
}

final class OtaStore {
  static let shared = OtaStore()
  private let lock = NSRecursiveLock()
  private let baseline: OtaManifest?
  private let publicKey: Data?
  private let root: URL
  private var state: OtaState
  private var selected = false
  private var selectedURL: URL?
  private var runningVersion = 0

  private init() {
#if DEBUG
    baseline = nil
    publicKey = nil
#else
    baseline = Bundle.main.url(forResource: "bundle-manifest", withExtension: "json", subdirectory: "ota")
      .flatMap { try? Data(contentsOf: $0) }.flatMap { try? JSONDecoder().decode(OtaManifest.self, from: $0) }
    publicKey = Bundle.main.url(forResource: "public-key", withExtension: "der", subdirectory: "ota")
      .flatMap { try? Data(contentsOf: $0) }
#endif
    let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    root = support.appendingPathComponent("ota/\(baseline?.runtimeVersion ?? "disabled")", isDirectory: true)
    try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    var excluded = URLResourceValues()
    excluded.isExcludedFromBackup = true
    var directory = root
    try? directory.setResourceValues(excluded)
    state = (try? Data(contentsOf: root.appendingPathComponent("state.json")))
      .flatMap { try? JSONDecoder().decode(OtaState.self, from: $0) } ?? OtaState()
  }

  private func save(_ nextState: OtaState) throws {
    try JSONEncoder().encode(nextState).write(to: root.appendingPathComponent("state.json"), options: .atomic)
    // Failed persistence must leave pending/trial available for retry and recovery.
    state = nextState
  }

  private func directory(_ version: Int) -> URL { root.appendingPathComponent(String(version), isDirectory: true) }
  private func hash(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }

  private func verifyEnvelope(_ bytes: Data) throws -> OtaManifest {
    guard let baseline, let publicKey, bytes.count <= 65536,
          let envelope = try JSONSerialization.jsonObject(with: bytes) as? [String: String],
          let payload = Data(base64Encoded: envelope["payload"] ?? ""),
          let signature = Data(base64Encoded: envelope["signature"] ?? ""),
          let key = SecKeyCreateWithData(publicKey as CFData, [
            kSecAttrKeyType: kSecAttrKeyTypeRSA, kSecAttrKeyClass: kSecAttrKeyClassPublic
          ] as CFDictionary, nil),
          SecKeyVerifySignature(key, .rsaSignatureMessagePKCS1v15SHA256, payload as CFData, signature as CFData, nil) else {
      throw otaError("OTA disabled or invalid signature")
    }
    let manifest = try JSONDecoder().decode(OtaManifest.self, from: payload)
    guard manifest.compatibility == baseline.compatibility,
          (1...2100000000).contains(manifest.bundleVersion),
          (1...20 * 1024 * 1024).contains(manifest.businessBytes),
          manifest.businessSha256.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else {
      throw otaError("Incompatible OTA manifest")
    }
    return manifest
  }

  private func verifyBusiness(_ manifest: OtaManifest, _ data: Data) throws {
    guard data.count == manifest.businessBytes, hash(data) == manifest.businessSha256 else {
      throw otaError("Business bundle integrity check failed")
    }
  }

  func stage(_ address: String) throws -> Int {
    lock.lock(); defer { lock.unlock() }
    guard baseline != nil, publicKey != nil else { throw otaError("OTA not enabled for this package") }
    guard state.pending == 0, state.trial == 0 else { throw otaError("An OTA update is awaiting confirmation or restart") }
    let envelope = try OtaDownload(limit: 65536).fetch(address)
    let manifest = try verifyEnvelope(envelope)
    guard manifest.bundleVersion > state.highest, let url = manifest.businessUrl else {
      throw otaError("OTA version is not newer than the highest installed version")
    }
    let business = try OtaDownload(limit: manifest.businessBytes).fetch(url)
    try verifyBusiness(manifest, business)
    let target = directory(manifest.bundleVersion)
    try FileManager.default.createDirectory(at: target, withIntermediateDirectories: true)
    try business.write(to: target.appendingPathComponent("business.bundle"), options: .atomic)
    try envelope.write(to: target.appendingPathComponent("release.json"), options: .atomic)
    var nextState = state
    nextState.pending = manifest.bundleVersion
    nextState.highest = manifest.bundleVersion
    try save(nextState)
    return manifest.bundleVersion
  }

  private func prepare(_ version: Int) throws -> URL? {
    if version == 0 { return nil }
    let target = directory(version)
    let manifest = try verifyEnvelope(Data(contentsOf: target.appendingPathComponent("release.json")))
    guard manifest.bundleVersion == version else { throw otaError("Stored version mismatch") }
    let business = try Data(contentsOf: target.appendingPathComponent("business.bundle"))
    try verifyBusiness(manifest, business)
    guard let baseURL = Bundle.main.url(forResource: "base", withExtension: "bundle", subdirectory: "ota") else {
      throw otaError("Missing base bundle")
    }
    var combined = try Data(contentsOf: baseURL)
    guard hash(combined) == baseline?.baseVersion else { throw otaError("Base bundle integrity check failed") }
    // Source concatenation preserves one Metro runtime; Hermes bytecode is not concatenable.
    combined.append(10)
    combined.append(business)
    let url = target.appendingPathComponent("combined.bundle")
    try combined.write(to: url, options: .atomic)
    return url
  }

  func selectBundle() -> URL? {
    lock.lock(); defer { lock.unlock() }
    if selected { return selectedURL }
    selected = true
    guard baseline != nil else { return nil }
    do {
      // The durable trial marker lets the next launch recover even when JS never starts.
      var nextState = state
      if nextState.trial != 0 {
        nextState.failed = nextState.trial
        nextState.current = nextState.previous
        nextState.previous = 0
        nextState.trial = 0
      }
      if nextState.pending != 0 {
        nextState.previous = nextState.current
        nextState.current = nextState.pending
        nextState.trial = nextState.pending
        nextState.pending = 0
      }
      try save(nextState)
      runningVersion = state.current
      do { selectedURL = try prepare(runningVersion) }
      catch {
        var fallback = state
        fallback.failed = runningVersion
        fallback.current = state.previous
        fallback.previous = 0
        fallback.trial = 0
        let fallbackURL: URL?
        do { fallbackURL = try prepare(fallback.current) }
        catch { fallback.current = 0; fallbackURL = nil }
        try save(fallback)
        runningVersion = state.current
        selectedURL = fallbackURL
      }
      let retained = [state.current, state.previous, state.pending]
      for file in (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? [] {
        if let version = Int(file.lastPathComponent), !retained.contains(version) {
          try? FileManager.default.removeItem(at: file)
        }
      }
    } catch { runningVersion = 0; selectedURL = nil }
    return selectedURL
  }

  func markSuccessful() throws -> Bool {
    lock.lock(); defer { lock.unlock() }
    if runningVersion != 0, state.trial == runningVersion {
      var nextState = state
      nextState.trial = 0
      try save(nextState)
    }
    return true
  }

  func status() throws -> String {
    lock.lock(); defer { lock.unlock() }
    let values: [String: Any] = [
      "supported": baseline != nil && publicKey != nil,
      "runtimeVersion": baseline?.runtimeVersion ?? "", "baseVersion": baseline?.baseVersion ?? "",
      "currentVersion": runningVersion, "pendingVersion": state.pending, "previousVersion": state.previous,
      "failedVersion": state.failed, "highestVersion": state.highest
    ]
    return String(decoding: try JSONSerialization.data(withJSONObject: values), as: UTF8.self)
  }
}

@objc(OtaBundle)
final class OtaBundle: NSObject {
  private let queue = DispatchQueue(label: "com.whitelabelapp.ota")
  @objc static func requiresMainQueueSetup() -> Bool { false }
  @objc func constantsToExport() -> [String: Any] {
    ["assetRoot": Bundle.main.bundleURL.absoluteString + "/"]
  }
  private func run(_ resolve: @escaping RCTPromiseResolveBlock, _ reject: @escaping RCTPromiseRejectBlock,
                   operation: @escaping () throws -> Any) {
    queue.async {
      do { resolve(try operation()) } catch { reject("OTA_ERROR", error.localizedDescription, error) }
    }
  }
  @objc(getStatus:rejecter:)
  func getStatus(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) { try OtaStore.shared.status() }
  }
  @objc(stage:resolver:rejecter:)
  func stage(_ url: String, resolver resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) { try OtaStore.shared.stage(url) }
  }
  @objc(markSuccessful:rejecter:)
  func markSuccessful(_ resolve: @escaping RCTPromiseResolveBlock, rejecter reject: @escaping RCTPromiseRejectBlock) {
    run(resolve, reject) { try OtaStore.shared.markSuccessful() }
  }
}
