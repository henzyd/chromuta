// Flutter colors. Requires "flutter" in chromuta.dialects.
// The first three are all the brand blue #3b82f6, written three different ways.

import 'package:flutter/material.dart';

const Color brandColor = Color(0xFF3B82F6);
const Color brandAlt = Color.fromARGB(255, 59, 130, 246);
const Color brandThird = Color.fromRGBO(59, 130, 246, 1.0);

// A bare integer with a color-ish name nearby is trusted.
const int surfaceTint = 0xFF0F172A;

// A bare integer with nothing to vouch for it lands in "Needs review" instead:
// this is indistinguishable from a bitmask.
const int featureMask = 0xFF00FF00;

final ThemeData theme = ThemeData(
  scaffoldBackgroundColor: const Color(0xFFFFFFFF),
  primaryColor: brandColor,
  dividerColor: const Color(0x140F172A),
);
