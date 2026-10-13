import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:stacked/stacked.dart';

import '../core/backend.dart';

/// Logged-in Core User (`admins/{uid}`) — web panel sarkha email + password.
class Me {
  const Me({required this.uid, required this.name, required this.email, required this.superAdmin, this.modules = const {}, this.projects = const []});
  final String uid;
  final String name;
  final String email;
  final bool superAdmin;

  /// Module Access (`clientTickets` / `devTickets` → view, raise, edit, assign, status).
  final Map<String, List<String>> modules;

  /// Access asleli projects (Dev Tickets raise sathi).
  final List<String> projects;

  /// Server `hasModule` sarkha — super admin la sagle.
  bool can(String module, String perm) => superAdmin || (modules[module]?.contains(perm) ?? false);
}

enum SessionState { loading, signedOut, signedIn }

class SessionService with ListenableServiceMixin {
  SessionService() {
    listenToReactiveValues([_state]);
    _sub = _auth.authStateChanges().listen(_onUser);
  }

  final _auth = FirebaseAuth.instance;
  late final StreamSubscription<User?> _sub;
  final _state = ReactiveValue<SessionState>(SessionState.loading);
  Me? _me;

  /// Login nakarla gela (disabled / Core User nahi) tar karan.
  String? blockedReason;

  SessionState get state => _state.value;
  Me get me => _me!;

  Future<void> _onUser(User? user) async {
    if (user == null) {
      _me = null;
      _state.value = SessionState.signedOut;
      return;
    }
    try {
      // Rules: admin la swatahcha doc vachta yeto.
      final doc = await FirebaseFirestore.instance.collection('admins').doc(user.uid).get();
      final x = doc.data();
      if (x == null || x['active'] != true) {
        blockedReason = x == null ? 'This account is not a MultiSarv Core user.' : 'Your account is disabled. Contact the super admin.';
        await _auth.signOut();
        return;
      }
      final modules = <String, List<String>>{
        for (final e in ((x['modules'] as Map?) ?? const {}).entries)
          if (e.value is List) '${e.key}': (e.value as List).map((p) => '$p').toList(),
      };
      _me = Me(
        uid: user.uid,
        name: '${x['name'] ?? ''}',
        email: '${x['email'] ?? user.email ?? ''}',
        superAdmin: x['role'] == 'superAdmin',
        modules: modules,
        projects: [
          for (final e in ((x['projects'] as Map?) ?? const {}).entries)
            if (e.value is List && (e.value as List).isNotEmpty) '${e.key}',
        ],
      );
      blockedReason = null;
      _state.value = SessionState.signedIn;
      // Web `session.tsx` sarkha: role badalla (super admin kela / kadhla) pan token madhe juna
      // `superAdmin` claim — Firestore rules (tickets) nakartat. Token ekda taja.
      unawaited(_syncClaim(user, x['role'] == 'superAdmin'));
    } catch (e) {
      blockedReason = errorText(e);
      await _auth.signOut();
    }
  }

  Future<void> _syncClaim(User user, bool superAdmin) async {
    try {
      final r = await user.getIdTokenResult();
      if ((r.claims?['superAdmin'] == true) != superAdmin) await user.getIdToken(true);
    } catch (_) {}
  }

  Future<void> signIn(String email, String password) async {
    blockedReason = null;
    await _auth.signInWithEmailAndPassword(email: email.trim().toLowerCase(), password: password);
  }

  Future<void> resetPassword(String email) => _auth.sendPasswordResetEmail(email: email.trim().toLowerCase());

  Future<void> signOut() => _auth.signOut();

  void dispose() => _sub.cancel();
}
