// Swift colors. Requires "swift" in chromuta.dialects.

import SwiftUI
import UIKit

enum Palette {
    // The brand blue, as unit floats.
    static let brand = UIColor(red: 0.231, green: 0.51, blue: 0.965, alpha: 1.0)
    static let brandMac = NSColor(red: 0.231, green: 0.51, blue: 0.965, alpha: 1.0)
    static let brandUI = Color(red: 0.231, green: 0.51, blue: 0.965)

    static let surface = UIColor(red: 1.0, green: 1.0, blue: 1.0, alpha: 1.0)
    static let overlay = Color(red: 0.059, green: 0.09, blue: 0.165, opacity: 0.72)

    // Read but never written back, since neither is an output notation.
    static let dim = UIColor(white: 0.5, alpha: 1.0)
    static let warm = UIColor(hue: 0.05, saturation: 0.8, brightness: 0.95, alpha: 1.0)

    // Not a color literal: nothing to detect here.
    static let named = UIColor(named: "AccentColor")
}
