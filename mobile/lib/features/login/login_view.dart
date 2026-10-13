import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:stacked/stacked.dart';

import '../../app/locator.dart';
import '../../app/motion.dart';
import '../../app/theme.dart';
import '../../core/backend.dart';
import '../../services/session_service.dart';

class LoginViewModel extends BaseViewModel {
  final _session = locator<SessionService>();
  final email = TextEditingController();
  final password = TextEditingController();
  String? message;
  bool hidden = true;

  /// Pratyek error la navin — `Shake` parat chalto.
  int errors = 0;

  String? get blocked => _session.blockedReason;

  void toggleHidden() {
    hidden = !hidden;
    notifyListeners();
  }

  void _fail(String m) {
    message = m;
    errors++;
    HapticFeedback.mediumImpact();
  }

  Future<void> signIn() async {
    if (email.text.trim().isEmpty || password.text.isEmpty) {
      _fail('Enter your email and password.');
      return notifyListeners();
    }
    message = null;
    await runBusyFuture(
      _session.signIn(email.text, password.text).catchError((Object e) {
        _fail(errorText(e));
      }),
    );
  }

  Future<String> reset() async {
    if (email.text.trim().isEmpty) return 'Enter your email first.';
    try {
      await _session.resetPassword(email.text);
      return 'Password reset link sent to ${email.text.trim()}.';
    } catch (e) {
      return errorText(e);
    }
  }

  @override
  void dispose() {
    email.dispose();
    password.dispose();
    super.dispose();
  }
}

/// Web panel sarkha login — Core User email + password.
class LoginView extends StatelessWidget {
  const LoginView({super.key});

  @override
  Widget build(BuildContext context) {
    return ViewModelBuilder<LoginViewModel>.reactive(
      viewModelBuilder: LoginViewModel.new,
      builder: (context, vm, _) {
        final err = vm.message ?? vm.blocked;
        final muted = Wa.muted(context);
        return Scaffold(
          body: Stack(
            children: [
              const Positioned.fill(child: Aurora()),
              SafeArea(
                child: Stack(
                  children: [
                    Center(
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.fromLTRB(24, 56, 24, 24),
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 420),
                          child: AutofillGroup(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.stretch,
                              children: [
                                const Center(
                                  child: Float(
                                    child: PulseRing(color: Wa.accent, size: 72, radius: 20, child: _GlowLogo()),
                                  ),
                                ),
                                const SizedBox(height: 28),
                                Rise(
                                  index: 1,
                                  child: Text(
                                    'Welcome back',
                                    textAlign: TextAlign.center,
                                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800, letterSpacing: -.5),
                                  ),
                                ),
                                const SizedBox(height: 6),
                                Rise(
                                  index: 2,
                                  child: Text(
                                    'Sign in to MultiSarv Chat with your Core account',
                                    textAlign: TextAlign.center,
                                    style: TextStyle(color: muted, height: 1.4),
                                  ),
                                ),
                                const SizedBox(height: 28),
                                Rise(
                                  index: 3,
                                  child: Shake(
                                    trigger: vm.errors,
                                    child: _Card(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.stretch,
                                        children: [
                                          _Label('Email'),
                                          TextField(
                                            controller: vm.email,
                                            keyboardType: TextInputType.emailAddress,
                                            autofillHints: const [AutofillHints.email],
                                            textInputAction: TextInputAction.next,
                                            decoration: const InputDecoration(
                                              hintText: 'you@company.com',
                                              prefixIcon: Icon(Icons.alternate_email_rounded, size: 20),
                                            ),
                                          ),
                                          const SizedBox(height: 14),
                                          _Label('Password'),
                                          TextField(
                                            controller: vm.password,
                                            obscureText: vm.hidden,
                                            autofillHints: const [AutofillHints.password],
                                            textInputAction: TextInputAction.done,
                                            onSubmitted: (_) => vm.signIn(),
                                            decoration: InputDecoration(
                                              hintText: '••••••••',
                                              prefixIcon: const Icon(Icons.lock_outline_rounded, size: 20),
                                              suffixIcon: IconButton(
                                                icon: AnimatedSwitcher(
                                                  duration: const Duration(milliseconds: 200),
                                                  transitionBuilder: (c, a) => ScaleTransition(scale: a, child: c),
                                                  child: Icon(
                                                    vm.hidden ? Icons.visibility_outlined : Icons.visibility_off_outlined,
                                                    key: ValueKey(vm.hidden),
                                                    size: 20,
                                                  ),
                                                ),
                                                onPressed: vm.toggleHidden,
                                              ),
                                            ),
                                          ),
                                          AnimatedSize(
                                            duration: const Duration(milliseconds: 250),
                                            curve: easeOutSoft,
                                            child: err == null ? const SizedBox(width: double.infinity) : _Error(err),
                                          ),
                                          const SizedBox(height: 20),
                                          _GradientButton(busy: vm.isBusy, onPressed: vm.signIn, label: 'Sign in'),
                                          const SizedBox(height: 4),
                                          TextButton(
                                            onPressed: () async {
                                              final msg = await vm.reset();
                                              if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
                                            },
                                            child: const Text('Forgot password?', style: TextStyle(fontWeight: FontWeight.w600)),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                                const SizedBox(height: 24),
                                Rise(
                                  index: 4,
                                  child: Row(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      Icon(Icons.verified_user_outlined, size: 14, color: muted),
                                      const SizedBox(width: 6),
                                      Text('Secured by MultiSarv Core', style: TextStyle(fontSize: 12, color: muted)),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    ),
                    // Scroll area chya var — nahi tar tap pochat nahi.
                    const Positioned(top: 4, right: 4, child: ThemeToggle()),
                  ],
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _GlowLogo extends StatelessWidget {
  const _GlowLogo();

  @override
  Widget build(BuildContext context) => DecoratedBox(
    decoration: BoxDecoration(
      borderRadius: BorderRadius.circular(20),
      boxShadow: [BoxShadow(color: Wa.accent.withValues(alpha: .45), blurRadius: 28, offset: const Offset(0, 10))],
    ),
    child: const Logo(size: 72),
  );
}

/// Kanchesarkha (glass) card — aurora magun halka disto.
class _Card extends StatelessWidget {
  const _Card({required this.child});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final dark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 10),
      decoration: BoxDecoration(
        color: Wa.surface(context).withValues(alpha: dark ? .82 : .9),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: Wa.border(context)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: dark ? .4 : .08),
            blurRadius: 40,
            offset: const Offset(0, 16),
            spreadRadius: -12,
          ),
        ],
      ),
      child: child,
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(left: 4, bottom: 6),
    child: Text(
      text,
      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: Wa.text(context)),
    ),
  );
}

class _Error extends StatelessWidget {
  const _Error(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme.error;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(top: 14),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(color: c.withValues(alpha: .1), borderRadius: BorderRadius.circular(12)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.error_outline_rounded, size: 18, color: c),
          const SizedBox(width: 8),
          Expanded(
            child: Text(text, style: TextStyle(color: c, fontSize: 13, height: 1.35)),
          ),
        ],
      ),
    );
  }
}

/// Logo che rang — indigo → cyan gradient button.
class _GradientButton extends StatelessWidget {
  const _GradientButton({required this.busy, required this.onPressed, required this.label});
  final bool busy;
  final VoidCallback onPressed;
  final String label;

  @override
  Widget build(BuildContext context) => Pressable(
    onTap: busy ? null : onPressed,
    child: AnimatedOpacity(
      duration: const Duration(milliseconds: 200),
      opacity: busy ? .8 : 1,
      child: Container(
        height: 52,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          gradient: const LinearGradient(colors: [Wa.logoFrom, Color(0xFF4F7BEA), Wa.logoTo]),
          boxShadow: [BoxShadow(color: Wa.accent.withValues(alpha: .35), blurRadius: 18, offset: const Offset(0, 8), spreadRadius: -4)],
        ),
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 200),
          child: busy
              ? const SizedBox.square(
                  key: ValueKey(1),
                  dimension: 22,
                  child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                )
              : Row(
                  key: const ValueKey(0),
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      label,
                      style: const TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.w700, letterSpacing: .2),
                    ),
                    const SizedBox(width: 8),
                    const Icon(Icons.arrow_forward_rounded, color: Colors.white, size: 20),
                  ],
                ),
        ),
      ),
    ),
  );
}
