import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'theme.dart';

/// Web `cubic-bezier(0.2, 0.8, 0.2, 1)` — saglya entrance animations sathi.
const easeOutSoft = Cubic(.2, .8, .2, 1);

/// Khalun var fade + slide (web `.animate-rise`) — `index` ne stagger.
class Rise extends StatefulWidget {
  const Rise({super.key, required this.child, this.index = 0, this.offset = 14, this.duration = const Duration(milliseconds: 450)});
  final Widget child;
  final int index;
  final double offset;
  final Duration duration;

  @override
  State<Rise> createState() => _RiseState();
}

class _RiseState extends State<Rise> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: widget.duration);
  late final _a = CurvedAnimation(parent: _c, curve: easeOutSoft);

  @override
  void initState() {
    super.initState();
    // Jast items asel tar shevatche ushira yenar nahit — kamal 8 steps.
    Future.delayed(Duration(milliseconds: 55 * math.min(widget.index, 8)), () {
      if (mounted) _c.forward();
    });
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _a,
    child: widget.child,
    builder: (context, child) => Opacity(
      opacity: _a.value,
      child: Transform.translate(offset: Offset(0, widget.offset * (1 - _a.value)), child: child),
    ),
  );
}

/// Dabla ki thoda lahan (iOS / web `active:scale-95` sarkha).
class Pressable extends StatefulWidget {
  const Pressable({super.key, required this.child, this.onTap, this.onLongPress, this.scale = .97});
  final Widget child;
  final VoidCallback? onTap;
  final VoidCallback? onLongPress;
  final double scale;

  @override
  State<Pressable> createState() => _PressableState();
}

class _PressableState extends State<Pressable> {
  bool _down = false;

  void _set(bool v) {
    if (_down != v) setState(() => _down = v);
  }

  @override
  Widget build(BuildContext context) => GestureDetector(
    behavior: HitTestBehavior.opaque,
    onTapDown: widget.onTap == null ? null : (_) => _set(true),
    onTapUp: (_) => _set(false),
    onTapCancel: () => _set(false),
    onTap: widget.onTap,
    onLongPress: widget.onLongPress,
    child: AnimatedScale(scale: _down ? widget.scale : 1, duration: const Duration(milliseconds: 120), curve: Curves.easeOut, child: widget.child),
  );
}

/// Loading placeholder var chamakni (web `shimmer`).
class Shimmer extends StatefulWidget {
  const Shimmer({super.key, required this.child});
  final Widget child;

  @override
  State<Shimmer> createState() => _ShimmerState();
}

class _ShimmerState extends State<Shimmer> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1400))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final base = Wa.surface2(context);
    final hi = Theme.of(context).brightness == Brightness.dark ? const Color(0xFF232836) : Colors.white;
    return AnimatedBuilder(
      animation: _c,
      child: widget.child,
      builder: (context, child) => ShaderMask(
        blendMode: BlendMode.srcATop,
        shaderCallback: (r) => LinearGradient(
          colors: [base, hi, base],
          stops: const [.35, .5, .65],
          begin: Alignment(-2.5 + 4 * _c.value, 0),
          end: Alignment(-.5 + 4 * _c.value, 0),
        ).createShader(r),
        child: child,
      ),
    );
  }
}

/// Skeleton cha ek tukda.
class Bone extends StatelessWidget {
  const Bone({super.key, this.width, this.height = 12, this.radius = 6});
  final double? width;
  final double height;
  final double radius;

  @override
  Widget build(BuildContext context) => Container(
    width: width,
    height: height,
    decoration: BoxDecoration(color: Wa.surface2(context), borderRadius: BorderRadius.circular(radius)),
  );
}

/// Halu var-khali tarangnara (web `.animate-float`).
class Float extends StatefulWidget {
  const Float({super.key, required this.child, this.distance = 8});
  final Widget child;
  final double distance;

  @override
  State<Float> createState() => _FloatState();
}

class _FloatState extends State<Float> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(seconds: 5))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _c,
    child: widget.child,
    builder: (context, child) => Transform.translate(offset: Offset(0, -widget.distance * (.5 - .5 * math.cos(2 * math.pi * _c.value))), child: child),
  );
}

/// Bahervar pasarnari ring (web `.animate-pulse-ring`).
class PulseRing extends StatefulWidget {
  const PulseRing({super.key, required this.child, required this.color, this.size = 64, this.radius});
  final Widget child;
  final Color color;
  final double size;

  /// null = gol; nahi tar rounded square.
  final double? radius;

  @override
  State<PulseRing> createState() => _PulseRingState();
}

class _PulseRingState extends State<PulseRing> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800))..repeat();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final shape = widget.radius == null ? const BoxDecoration(shape: BoxShape.circle) : BoxDecoration(borderRadius: BorderRadius.circular(widget.radius!));
    return Stack(
      alignment: Alignment.center,
      clipBehavior: Clip.none,
      children: [
        AnimatedBuilder(
          animation: _c,
          builder: (context, _) {
            final t = Curves.easeOut.transform(_c.value);
            return Transform.scale(
              scale: .85 + t * .9,
              child: Container(
                width: widget.size,
                height: widget.size,
                decoration: shape.copyWith(
                  border: Border.all(color: widget.color.withValues(alpha: .6 * (1 - t)), width: 2),
                ),
              ),
            );
          },
        ),
        widget.child,
      ],
    );
  }
}

/// Error zala ki aadva halnara (web `.animate-shake`) — `trigger` badalla ki chalto.
class Shake extends StatefulWidget {
  const Shake({super.key, required this.child, required this.trigger});
  final Widget child;
  final Object? trigger;

  @override
  State<Shake> createState() => _ShakeState();
}

class _ShakeState extends State<Shake> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 450));

  @override
  void didUpdateWidget(Shake old) {
    super.didUpdateWidget(old);
    if (widget.trigger != null && widget.trigger != old.trigger) _c.forward(from: 0);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
    animation: _c,
    child: widget.child,
    builder: (context, child) => Transform.translate(offset: Offset(math.sin(_c.value * math.pi * 6) * 6 * (1 - _c.value), 0), child: child),
  );
}

/// Login background — halu firnare rangit dhag (web `.animate-aurora`).
class Aurora extends StatefulWidget {
  const Aurora({super.key});

  @override
  State<Aurora> createState() => _AuroraState();
}

class _AuroraState extends State<Aurora> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(seconds: 18))..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    final a = dark ? .30 : .22;
    return IgnorePointer(
      child: AnimatedBuilder(
        animation: _c,
        builder: (context, _) {
          final t = Curves.easeInOut.transform(_c.value);
          return Stack(
            children: [
              _blob(Alignment(-1.1 + .5 * t, -1 + .3 * t), Wa.logoFrom.withValues(alpha: a), 1.1 + .15 * t),
              _blob(Alignment(1.2 - .4 * t, -.4 + .5 * t), Wa.logoTo.withValues(alpha: a * .9), .9),
              _blob(Alignment(-.3 + .6 * t, 1.2 - .3 * t), const Color(0xFFA855F7).withValues(alpha: a * .7), 1),
            ],
          );
        },
      ),
    );
  }

  Widget _blob(Alignment at, Color c, double scale) => Align(
    alignment: at,
    child: Transform.scale(
      scale: scale,
      child: Container(
        width: 340,
        height: 340,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          gradient: RadialGradient(colors: [c, c.withValues(alpha: 0)]),
        ),
      ),
    ),
  );
}

/// Smooth page change — navin page ujvikadun halu sarakto + fade (iOS sarkha feel, Android var pan).
class SoftPageTransitions extends PageTransitionsBuilder {
  const SoftPageTransitions();

  @override
  Widget buildTransitions<T>(PageRoute<T> route, BuildContext context, Animation<double> animation, Animation<double> secondary, Widget child) {
    final inA = CurvedAnimation(parent: animation, curve: easeOutSoft, reverseCurve: Curves.easeInCubic);
    final outA = CurvedAnimation(parent: secondary, curve: easeOutSoft);
    return SlideTransition(
      position: Tween(begin: Offset.zero, end: const Offset(-.08, 0)).animate(outA),
      child: SlideTransition(
        position: Tween(begin: const Offset(.25, 0), end: Offset.zero).animate(inA),
        child: FadeTransition(opacity: inA, child: child),
      ),
    );
  }
}
