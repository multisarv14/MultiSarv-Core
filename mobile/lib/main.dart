import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:stacked/stacked.dart';

import 'app/locator.dart';
import 'app/motion.dart';
import 'app/theme.dart';
import 'features/home/home_view.dart';
import 'features/login/login_view.dart';
import 'firebase_options.dart';
import 'services/push_service.dart';
import 'services/session_service.dart';

/// MultiSarv Core — Internal Chat ani Tickets (web panel chi phone app).
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  // App band astana chat push → ✓✓ delivered.
  FirebaseMessaging.onBackgroundMessage(firebaseBackgroundPush);
  setupLocator();
  await themeController.load();
  runApp(const MultisarvApp());
}

class MultisarvApp extends StatelessWidget {
  const MultisarvApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder(
      valueListenable: themeController,
      builder: (context, mode, _) => MaterialApp(
        title: 'MultiSarv',
        debugShowCheckedModeBanner: false,
        navigatorKey: navigatorKey,
        themeMode: mode,
        theme: buildTheme(Brightness.light),
        darkTheme: buildTheme(Brightness.dark),
        home: const _Gate(),
      ),
    );
  }
}

/// Login asel tar home (chats / tickets), nahi tar login.
class _Gate extends StatelessWidget {
  const _Gate();

  @override
  Widget build(BuildContext context) {
    return ViewModelBuilder<_GateModel>.reactive(
      viewModelBuilder: _GateModel.new,
      builder: (context, vm, _) => AnimatedSwitcher(
        duration: const Duration(milliseconds: 400),
        switchInCurve: easeOutSoft,
        child: switch (vm.state) {
          SessionState.loading => const _Splash(),
          SessionState.signedOut => const LoginView(),
          SessionState.offline => _Offline(onRetry: vm.retry),
          // Navin user = navin home (juna state nako).
          SessionState.signedIn => HomeView(key: ValueKey(vm.uid)),
        },
      ),
    );
  }
}

/// Session tapasat astana — logo + pulse.
class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) => const Scaffold(
    body: Center(
      child: PulseRing(color: Wa.accent, size: 64, radius: 18, child: Logo(size: 64)),
    ),
  );
}

/// Login ahe pan pahilyanda profile anta ala nahi (net nahi) — logout na karta Retry.
class _Offline extends StatelessWidget {
  const _Offline({required this.onRetry});
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Scaffold(
    body: SafeArea(
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Logo(size: 56),
              const SizedBox(height: 20),
              const Text("Can't reach MultiSarv", style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Text('Check your internet connection and try again.', textAlign: TextAlign.center, style: TextStyle(color: Wa.muted(context))),
              const SizedBox(height: 20),
              FilledButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh_rounded), label: const Text('Retry')),
            ],
          ),
        ),
      ),
    ),
  );
}

class _GateModel extends ReactiveViewModel {
  final _session = locator<SessionService>();

  SessionState get state => _session.state;
  String get uid => _session.me.uid;

  void retry() => _session.retry();

  @override
  List<ListenableServiceMixin> get listenableServices => [_session];
}
