param(
  [string]$Apk = 'android/app/build/outputs/apk/release/app-release-unsigned.apk',
  [string]$Sdk = "$env:LOCALAPPDATA/Android/Sdk",
  [string]$Serial = 'emulator-5554'
)
$ErrorActionPreference = 'Stop'
$project = (Resolve-Path "$PSScriptRoot/../../..").Path
$apkPath = (Resolve-Path (Join-Path $project $Apk)).Path
$output = Join-Path $project ('artifacts/ota-native/' + [guid]::NewGuid().ToString('N'))
$remote = '/data/local/tmp/ota-regression-' + [guid]::NewGuid().ToString('N')
$adb = Join-Path $Sdk 'platform-tools/adb.exe'
$javaBin = Join-Path $env:JAVA_HOME 'bin'
function Invoke-Checked([string]$Command, [string[]]$Arguments) {
  & $Command @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$Command failed with exit code $LASTEXITCODE" }
}
New-Item -ItemType Directory -Force "$output/classes", "$output/dex" | Out-Null
Invoke-Checked node @("$PSScriptRoot/fixtures.cjs", $output)
Invoke-Checked "$javaBin/jar.exe" @('cf', "$output/fixtures.apk", '-C', "$output/fixture-assets", 'assets')
Invoke-Checked "$javaBin/javac.exe" @('-source', '8', '-target', '8', '-cp', "$Sdk/platforms/android-36/android.jar", '-d', "$output/classes", "$PSScriptRoot/OtaNativeProbe.java")
$classes = @(Get-ChildItem "$output/classes/*.class" | ForEach-Object { $_.FullName })
Invoke-Checked "$Sdk/build-tools/36.0.0/d8.bat" (@('--lib', "$Sdk/platforms/android-36/android.jar", '--output', "$output/dex") + $classes)
Invoke-Checked "$javaBin/jar.exe" @('cf', "$output/probe.jar", '-C', "$output/dex", 'classes.dex')
Invoke-Checked $adb @('-s', $Serial, 'shell', 'mkdir', '-p', $remote)
foreach ($file in @($apkPath, "$output/probe.jar", "$output/fixtures.apk", "$output/business.bundle") + @(Get-ChildItem "$output/*.json" | ForEach-Object { $_.FullName })) {
  Invoke-Checked $adb @('-s', $Serial, 'push', $file, "$remote/")
}
$remoteApk = "$remote/" + [IO.Path]::GetFileName($apkPath)
foreach ($phase in @('', 'checkpoint', 'recover')) {
  $result = & $adb -s $Serial shell "CLASSPATH=$remote/probe.jar`:$remoteApk app_process /system/bin OtaNativeProbe $remote $phase" 2>&1
  $code = $LASTEXITCODE
  $result | Tee-Object -FilePath "$output/results.txt" -Append
  if ($code -ne 0) { throw "Native probe failed in phase '$phase'" }
}
Get-FileHash $apkPath -Algorithm SHA256 | Format-List | Out-File "$output/apk-sha256.txt"
Write-Output "Native validation artifacts: $output"
