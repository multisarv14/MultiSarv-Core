import 'package:flutter/cupertino.dart' show CupertinoPageTransitionsBuilder;
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'motion.dart';

/// Web panel (`src/index.css`) che semantic tokens — light / dark donhi ithe.
/// Rang badalayche asel tar donhi kade (web + app) ekach vel badla.
class Wa {
  static const accent = Color(0xFF6366F1);
  static const accentFg = Colors.white;

  /// Logo gradient (`public/favicon.svg`).
  static const logoFrom = Color(0xFF6366F1);
  static const logoTo = Color(0xFF06B6D4);

  /// Web composer cha send button / reply bar (`#00a884`) — fakt composer madhe.
  static const green = Color(0xFF00A884);

  static bool _dark(BuildContext c) => Theme.of(c).brightness == Brightness.dark;
  static bool _onAccent(BuildContext c) => c.dependOnInheritedWidgetOfExactType<OnAccent>() != null;

  static Color bg(BuildContext c) => _dark(c) ? const Color(0xFF0B0D12) : const Color(0xFFF6F7FB);
  static Color surface(BuildContext c) => _dark(c) ? const Color(0xFF12151D) : Colors.white;
  static Color surface2(BuildContext c) => _dark(c) ? const Color(0xFF191D28) : const Color(0xFFF1F3F8);
  static Color border(BuildContext c) => _dark(c) ? const Color(0xFF252A37) : const Color(0xFFE4E7EF);
  static Color text(BuildContext c) => _dark(c) ? const Color(0xFFE8EAF2) : const Color(0xFF0F1222);

  static Color chatBg(BuildContext c) => surface(c);
  static Color mine(BuildContext c) => accent;
  // Web: `bg-surface-2/60` + border.
  static Color theirs(BuildContext c) => surface2(c);
  // Web composer: patti nahi (wallpaper), pill `bg-surface`.
  static Color bar(BuildContext c) => surface2(c);
  static Color pill(BuildContext c) => surface(c);
  static Color muted(BuildContext c) => _onAccent(c) ? accentFg.withValues(alpha: .8) : (_dark(c) ? const Color(0xFF8A91A6) : const Color(0xFF646B80));
  static Color quote(BuildContext c) =>
      _onAccent(c) ? Colors.white.withValues(alpha: .15) : (_dark(c) ? Colors.white.withValues(alpha: .06) : Colors.black.withValues(alpha: .04));

  /// Web `Avatar` che gradient (`from-indigo-500 to-violet-500` …).
  static const _palette = [
    [Color(0xFF6366F1), Color(0xFF8B5CF6)],
    [Color(0xFF0EA5E9), Color(0xFF06B6D4)],
    [Color(0xFF10B981), Color(0xFF14B8A6)],
    [Color(0xFFF59E0B), Color(0xFFF97316)],
    [Color(0xFFF43F5E), Color(0xFFEC4899)],
    [Color(0xFFD946EF), Color(0xFFA855F7)],
  ];

  /// Web sarkhach hash (`h * 31 + code`, 32-bit) — eka user la donhi kade ekach rang.
  static List<Color> personGradient(String seed) {
    var h = 0;
    for (final u in seed.codeUnits) {
      h = (h * 31 + u).toSigned(32);
    }
    return _palette[h.abs() % _palette.length];
  }

  static Color person(String seed) => personGradient(seed).first;
}

/// Accent (mine) bubble chya aat — `Wa.muted` / `Wa.quote` pandhre hotat.
class OnAccent extends InheritedWidget {
  const OnAccent({super.key, required super.child});

  @override
  bool updateShouldNotify(OnAccent oldWidget) => false;
}

/// Light / dark / system — web sarkha `ms-theme` key (nasel tar system).
class ThemeController extends ValueNotifier<ThemeMode> {
  ThemeController() : super(ThemeMode.system);

  static const _key = 'ms-theme';

  Future<void> load() async {
    final v = (await SharedPreferences.getInstance()).getString(_key);
    value = v == 'dark' ? ThemeMode.dark : (v == 'light' ? ThemeMode.light : ThemeMode.system);
  }

  void set(ThemeMode mode) {
    value = mode;
    SharedPreferences.getInstance().then((p) => mode == ThemeMode.system ? p.remove(_key) : p.setString(_key, mode == ThemeMode.dark ? 'dark' : 'light'));
  }

  void toggle(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    value = dark ? ThemeMode.light : ThemeMode.dark;
    SharedPreferences.getInstance().then((p) => p.setString(_key, dark ? 'light' : 'dark'));
  }
}

final themeController = ThemeController();

/// Web header sarkha sun / moon button.
class ThemeToggle extends StatelessWidget {
  const ThemeToggle({super.key});

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return IconButton(
      tooltip: 'Theme',
      icon: Icon(dark ? Icons.light_mode_outlined : Icons.dark_mode_outlined),
      onPressed: () => themeController.toggle(context),
    );
  }
}

/// MultiSarv logo — `public/favicon.svg` jasa (gradient tile + "M").
class Logo extends StatelessWidget {
  const Logo({super.key, this.size = 36});
  final double size;

  @override
  Widget build(BuildContext context) => CustomPaint(size: Size.square(size), painter: _LogoPainter());
}

class _LogoPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    canvas.scale(size.width / 32);
    const rect = Rect.fromLTWH(0, 0, 32, 32);
    canvas.drawRRect(
      RRect.fromRectAndRadius(rect, const Radius.circular(8)),
      Paint()..shader = const LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Wa.logoFrom, Wa.logoTo]).createShader(rect),
    );
    final m = Path()
      ..moveTo(8, 22)
      ..lineTo(8, 10)
      ..lineTo(16, 17)
      ..lineTo(24, 10)
      ..lineTo(24, 22);
    canvas.drawPath(
      m,
      Paint()
        ..color = Colors.white
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2.6
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
  }

  @override
  bool shouldRepaint(_LogoPainter oldDelegate) => false;
}

ThemeData buildTheme(Brightness b) {
  final dark = b == Brightness.dark;
  final bg = dark ? const Color(0xFF0B0D12) : const Color(0xFFF6F7FB);
  final surface = dark ? const Color(0xFF12151D) : Colors.white;
  final surface2 = dark ? const Color(0xFF191D28) : const Color(0xFFF1F3F8);
  final border = dark ? const Color(0xFF252A37) : const Color(0xFFE4E7EF);
  final text = dark ? const Color(0xFFE8EAF2) : const Color(0xFF0F1222);
  final muted = dark ? const Color(0xFF8A91A6) : const Color(0xFF646B80);

  final scheme = ColorScheme.fromSeed(seedColor: Wa.accent, brightness: b).copyWith(
    primary: Wa.accent,
    onPrimary: Wa.accentFg,
    surface: surface,
    onSurface: text,
    onSurfaceVariant: muted,
    surfaceContainerLowest: bg,
    surfaceContainerLow: surface,
    surfaceContainer: surface,
    surfaceContainerHigh: surface,
    surfaceContainerHighest: surface2,
    outline: border,
    outlineVariant: border,
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    scaffoldBackgroundColor: bg,
    canvasColor: surface,
    dividerColor: border,
    dividerTheme: DividerThemeData(color: border, space: 1, thickness: 1),
    appBarTheme: AppBarTheme(
      backgroundColor: surface,
      foregroundColor: text,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      shape: Border(bottom: BorderSide(color: border)),
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(color: border),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: surface,
      surfaceTintColor: Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: dark ? const Color(0xFFE8EAF2) : const Color(0xFF0F1222),
      contentTextStyle: TextStyle(color: dark ? const Color(0xFF0F1222) : Colors.white, fontSize: 14),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    pageTransitionsTheme: const PageTransitionsTheme(
      builders: {TargetPlatform.android: SoftPageTransitions(), TargetPlatform.iOS: CupertinoPageTransitionsBuilder()},
    ),
    splashFactory: InkSparkle.splashFactory,
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: surface,
      surfaceTintColor: Colors.transparent,
      showDragHandle: true,
      dragHandleColor: border,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: bg,
      hintStyle: TextStyle(color: muted.withValues(alpha: .8)),
      prefixIconColor: WidgetStateColor.resolveWith((st) => st.contains(WidgetState.focused) ? Wa.accent : muted),
      suffixIconColor: muted,
      // Web input: `border-border`, focus la accent. (Border nako aslelya fields ne
      // `enabledBorder` / `focusedBorder` pan `InputBorder.none` dyave.)
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide(color: border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Wa.accent, width: 1.5),
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(backgroundColor: Wa.accent, foregroundColor: Wa.accentFg),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: Wa.accent),
  );
}
