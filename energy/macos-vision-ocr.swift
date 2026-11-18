// Adaptateur OCR macOS, aucune connexion réseau ni fichier image en clair.
// Compilation locale: xcrun swiftc -O energy/macos-vision-ocr.swift -o <fichier prive>
import Foundation
import Vision
import ImageIO
let data = FileHandle.standardInput.readDataToEndOfFile()
guard data.count > 64 && data.count <= 3 * 1024 * 1024,
  let src = CGImageSourceCreateWithData(data as CFData, nil),
  let image = CGImageSourceCreateImageAtIndex(src, 0, nil) else {
  fputs("IMAGE_INCOMPATIBLE\n", stderr)
  exit(2)
}
let req = VNRecognizeTextRequest()
req.recognitionLevel = .accurate
req.usesLanguageCorrection = false
if #available(macOS 11.0, *) {
  let languages = (try? req.supportedRecognitionLanguages()) ?? []
  let choices = ["fr-FR", "en-US"].filter { languages.contains($0) }
  if !choices.isEmpty { req.recognitionLanguages = choices }
}
do {
  try VNImageRequestHandler(cgImage: image, options: [:]).perform([req])
  var lines: [String] = []
  for observation in (req.results ?? []).prefix(60) {
    if let value = observation.topCandidates(1).first?.string {
      lines.append(String(value.prefix(200)))
    }
  }
  let output = try JSONSerialization.data(withJSONObject: ["lines": lines])
  FileHandle.standardOutput.write(output)
} catch {
  fputs("RECONNAISSANCE_INDISPONIBLE\n", stderr)
  exit(3)
}
