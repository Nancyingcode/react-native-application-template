import Foundation
import UIKit
import React

@objc(ThreadWatchdog)
final class ThreadWatchdog: NSObject, RCTInvalidating {
  private let worker = DispatchQueue(label: "app.thread-watchdog", qos: .utility)
  private var timer: DispatchSourceTimer?
  private var observers: [NSObjectProtocol] = []
  private var enabled = false
  private var foreground = false
  private var generation = 0
  private var jsBeat: TimeInterval = 0
  private var mainPending: TimeInterval?
  private var jsReported = false
  private var mainReported = false
  private let thresholdMs: Double = 5000
  private var reports: [[String: Any]] = []
  private var storage: URL?

  @objc static func requiresMainQueueSetup() -> Bool { true }
  @objc var methodQueue: DispatchQueue { worker }

  override init() {
    super.init()
    foreground = UIApplication.shared.applicationState == .active
    // 生命周期必须从原生接收，JS 卡死时仍能暂停后台检测。
    observe(UIApplication.didBecomeActiveNotification, active: true)
    observe(UIApplication.willResignActiveNotification, active: false)
    worker.async { [weak self] in self?.loadReports() }
  }

  private func observe(_ name: Notification.Name, active: Bool) {
    observers.append(NotificationCenter.default.addObserver(
      forName: name, object: nil, queue: .main
    ) { [weak self] _ in
      guard let self else { return }
      self.worker.async {
        self.foreground = active
        self.reset()
      }
    })
  }

  @objc func start() {
    enabled = true
    reset()
    guard timer == nil else { return }
    let source = DispatchSource.makeTimerSource(queue: worker)
    source.schedule(deadline: .now() + 1, repeating: 1)
    source.setEventHandler { [weak self] in self?.tick() }
    timer = source
    source.resume()
  }

  @objc func stop() {
    enabled = false
    timer?.cancel()
    timer = nil
    reset()
  }

  @objc func heartbeat() {
    guard enabled && foreground else { return }
    let now = ProcessInfo.processInfo.systemUptime
    checkJs(now)
    jsBeat = now
    jsReported = false
  }

  @objc func getReports(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    do {
      let data = try JSONSerialization.data(withJSONObject: reports)
      resolve(String(decoding: data, as: UTF8.self))
    } catch {
      reject("WATCHDOG_READ", error.localizedDescription, error)
    }
  }

  @objc func acknowledgeReports(_ ids: String) {
    guard let data = ids.data(using: .utf8),
          let values = try? JSONSerialization.jsonObject(with: data) as? [String] else { return }
    let acknowledged = Set(values)
    reports.removeAll { acknowledged.contains($0["id"] as? String ?? "") }
    persist()
  }

  private func reset() {
    generation += 1
    jsBeat = ProcessInfo.processInfo.systemUptime
    mainPending = nil
    jsReported = false
    mainReported = false
  }

  private func tick() {
    guard enabled && foreground else { return }
    let now = ProcessInfo.processInfo.systemUptime
    checkJs(now)
    if mainPending != nil {
      checkMain(now)
      return
    }
    mainPending = now
    let expectedGeneration = generation
    // 每轮只允许一个主线程探针，状态串行归属 worker，不阻塞被检测线程。
    DispatchQueue.main.async { [weak self] in
      let acknowledgedAt = ProcessInfo.processInfo.systemUptime
      guard let self else { return }
      self.worker.async {
        guard self.generation == expectedGeneration else { return }
        self.checkMain(acknowledgedAt)
        self.mainPending = nil
        self.mainReported = false
      }
    }
  }

  private func checkJs(_ now: TimeInterval) {
    let duration = (now - jsBeat) * 1000
    if !jsReported && duration >= thresholdMs {
      jsReported = true
      record(thread: "js", duration: duration)
    }
  }

  private func checkMain(_ now: TimeInterval) {
    guard let pending = mainPending else { return }
    let duration = (now - pending) * 1000
    if !mainReported && duration >= thresholdMs {
      mainReported = true
      record(thread: "native_main", duration: duration)
    }
  }

  private func record(thread: String, duration: Double) {
    let report: [String: Any] = [
      "id": UUID().uuidString, "thread": thread,
      "detectedAt": Date().timeIntervalSince1970 * 1000,
      "durationMs": duration, "thresholdMs": thresholdMs,
    ]
    reports.append(report)
    reports = Array(reports.suffix(40))
    NSLog("ThreadWatchdog: %@", String(describing: report))
    persist()
  }

  private func loadReports() {
    do {
      var directory = try FileManager.default.url(
        for: .applicationSupportDirectory, in: .userDomainMask,
        appropriateFor: nil, create: true
      ).appendingPathComponent("ThreadWatchdog", isDirectory: true)
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      var values = URLResourceValues()
      values.isExcludedFromBackup = true
      try directory.setResourceValues(values)
      let file = directory.appendingPathComponent("stalls.json")
      storage = file
      if FileManager.default.fileExists(atPath: file.path) {
        let data = try Data(contentsOf: file)
        if let saved = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
          reports = Array(saved.suffix(40))
        }
      }
    } catch {
      NSLog("ThreadWatchdog: cannot read stalls: %@", error.localizedDescription)
    }
  }

  private func persist() {
    guard let storage else { return }
    do {
      let data = try JSONSerialization.data(withJSONObject: reports)
      try data.write(to: storage, options: .atomic)
    } catch {
      NSLog("ThreadWatchdog: cannot save stalls: %@", error.localizedDescription)
    }
  }

  @objc func invalidate() {
    observers.forEach { NotificationCenter.default.removeObserver($0) }
    observers.removeAll()
    worker.async { [weak self] in self?.stop() }
  }

  deinit { timer?.cancel() }
}
