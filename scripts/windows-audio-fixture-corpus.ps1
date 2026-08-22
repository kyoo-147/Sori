# Build a deterministic, local-only speech corpus from Windows SAPI.
# No network access, model download, or microphone access is used.
[CmdletBinding()]
param(
  [string]$OutputDirectory = (Join-Path (Get-Location) 'data/audio-corpus'),
  [switch]$IncludeVietnamese
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech

$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
$available = @($voice.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo })
if ($available.Count -eq 0) { throw 'No Windows SAPI voices are installed.' }
$requested = $env:SORI_TTS_VOICE
$selected = if ($requested) { $available | Where-Object Name -eq $requested | Select-Object -First 1 } else { $available[0] }
if (-not $selected) { throw "Requested SAPI voice is not installed: $requested" }
$voice.SelectVoice($selected.Name)
$voiceInfo = [ordered]@{ name = $selected.Name; culture = $selected.Culture.Name; gender = "$($selected.Gender)" }
$viSupported = $selected.Culture.Name -match '^vi(-|$)'
$sentences = @([ordered]@{ id = 'en-greeting'; language = 'en'; text = 'Hello Sori, this is a local speech fixture.' }, [ordered]@{ id = 'en-pause'; language = 'en'; text = 'First sentence. Second sentence after a pause.' })
if ($IncludeVietnamese) {
  if (-not $viSupported) { Write-Warning "Skipping Vietnamese: selected voice culture $($selected.Culture.Name) is not Vietnamese." }
  else {
    $viText = 'Xin ch' + [char]0x00E0 + 'o Sori, ' + [char]0x0111 + [char]0x00E2 + 'y l' + [char]0x00E0 + ' m' + [char]0x1ED9 + 't m' + [char]0x1EAB + 'u gi' + [char]0x1ECD + 'ng n' + [char]0x00F3 + 'i c' + [char]0x1EE5 + 'c b' + [char]0x1ED9 + '.'
    $sentences += [ordered]@{ id = 'vi-greeting'; language = 'vi'; text = $viText }
  }
}
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$records = [System.Collections.Generic.List[object]]::new()
foreach ($sentence in $sentences) {
  $variants = @(
    [ordered]@{ id = 'base'; rate = 0; volume = 100; ssml = $false },
    [ordered]@{ id = 'silence-prefix-suffix'; rate = 0; volume = 100; ssml = $true },
    [ordered]@{ id = 'speed-slow'; rate = -3; volume = 100; ssml = $false },
    [ordered]@{ id = 'speed-fast'; rate = 3; volume = 100; ssml = $false },
    [ordered]@{ id = 'volume-low'; rate = 0; volume = 35; ssml = $false }
  )
  foreach ($variant in $variants) {
    $file = Join-Path $OutputDirectory "$($sentence.id)--$($variant.id).wav"
    $voice.Rate = $variant.rate; $voice.Volume = $variant.volume
    $voice.SetOutputToWaveFile($file, [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, 1))
    if ($variant.ssml) {
      $ssml = "<speak version='1.0' xml:lang='$($sentence.language)'><break time='450ms'/>$($sentence.text)<break time='450ms'/></speak>"
      $voice.SpeakSsml($ssml)
    } else { $voice.Speak($sentence.text) }
    $voice.SetOutputToNull()
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash.ToLowerInvariant()
    $records.Add([ordered]@{ file = [IO.Path]::GetFileName($file); expected_transcript = $sentence.text; language = $sentence.language; variant = $variant.id; provenance = [ordered]@{ source = 'Windows SAPI installed voice'; voice = $voiceInfo; generated_utc = [DateTime]::UtcNow.ToString('o'); network = $false; microphone = $false }; sha256 = $hash })
  }
}
$manifest = [ordered]@{ schema = 'sori.audio-corpus.v1'; generated_by = 'scripts/windows-audio-fixture-corpus.ps1'; voice = $voiceInfo; files = $records }
$manifest | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 (Join-Path $OutputDirectory 'manifest.json')
$voice.Dispose()
Write-Output "Generated $($records.Count) local WAV fixtures in $OutputDirectory using $($selected.Name) ($($selected.Culture.Name))."
