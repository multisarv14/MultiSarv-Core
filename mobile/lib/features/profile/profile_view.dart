import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../app/locator.dart';
import '../../app/theme.dart';
import '../../core/backend.dart';
import '../../data/chat_repository.dart';
import '../../data/ticket_repository.dart';
import '../../services/push_service.dart';
import '../../services/session_service.dart';
import '../conversation/widgets/avatar.dart';

/// Profile — majhi mahiti, access, theme, test notification, password, log out.
class ProfileView extends StatefulWidget {
  const ProfileView({super.key});

  @override
  State<ProfileView> createState() => _ProfileViewState();
}

class _ProfileViewState extends State<ProfileView> {
  final _session = locator<SessionService>();
  final _push = locator<PushService>();
  String? _designation;
  bool _testing = false;

  Me get _me => _session.me;

  @override
  void initState() {
    super.initState();
    _loadRole();
  }

  /// Settings → Roles madhla role (designation) naav.
  Future<void> _loadRole() async {
    try {
      final db = FirebaseFirestore.instance;
      final roleId = (await db.collection('admins').doc(_me.uid).get()).data()?['roleId'];
      if (roleId is! String || roleId.isEmpty) return;
      final name = (await db.collection('roles').doc(roleId).get()).data()?['name'];
      if (mounted && name is String) setState(() => _designation = name);
    } catch (_) {}
  }

  void _toast(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  Future<void> _test() async {
    setState(() => _testing = true);
    try {
      final r = await _push.test();
      if (r.devices == 0) {
        _toast('No device registered — allow notifications first.');
      } else if (r.sent == 0) {
        _toast('Registered but delivery failed — try again in a minute.');
      } else {
        _toast('Sent to this phone — check the notification bar.');
      }
    } catch (e) {
      _toast(errorText(e));
    } finally {
      if (mounted) setState(() => _testing = false);
    }
  }

  Future<void> _resetPassword() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Change password?'),
        content: Text("We'll email a password reset link to ${_me.email}."),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Send link')),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await _session.resetPassword(_me.email);
      _toast('Reset link sent to ${_me.email}');
    } catch (e) {
      _toast(errorText(e));
    }
  }

  Future<void> _signOut() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Log out?'),
        content: const Text("You'll stop receiving chat and ticket notifications on this phone."),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Theme.of(ctx).colorScheme.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Log out'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await _push.stop();
    locator<ChatRepository>().clear();
    locator<TicketRepository>().clear();
    await _session.signOut();
  }

  @override
  Widget build(BuildContext context) {
    final me = _me;
    final name = me.name.isEmpty ? me.email : me.name;
    final kinds = TicketKind.values.where((k) => me.can(k.module, 'view')).toList();
    return Scaffold(
      appBar: AppBar(
        automaticallyImplyLeading: false,
        backgroundColor: Wa.bg(context),
        titleSpacing: 16,
        title: const Text('Profile', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 24, letterSpacing: -.6)),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          Center(
            child: Avatar(name: name, seed: me.uid, radius: 44),
          ),
          const SizedBox(height: 12),
          Center(
            child: Text(
              name,
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: Wa.text(context)),
            ),
          ),
          Center(
            child: Text(me.email, style: TextStyle(color: Wa.muted(context))),
          ),
          const SizedBox(height: 10),
          Center(
            child: Wrap(
              spacing: 8,
              children: [
                _Chip(me.superAdmin ? 'Super Admin' : 'Admin', me.superAdmin ? const Color(0xFF8B5CF6) : Wa.accent),
                if (_designation != null) _Chip(_designation!, const Color(0xFF0EA5E9)),
              ],
            ),
          ),
          const SizedBox(height: 24),
          const _Label('Access'),
          _Group(
            children: [
              if (me.superAdmin)
                const _Tile(icon: Icons.verified_user_rounded, title: 'Full access', subtitle: 'All projects and modules')
              else ...[
                for (final k in kinds)
                  _Tile(
                    icon: k == TicketKind.dev ? Icons.build_circle_outlined : Icons.support_agent_rounded,
                    title: k.label,
                    subtitle: me.modules[k.module]!.map((p) => p[0].toUpperCase() + p.substring(1)).join(', '),
                  ),
                if (kinds.isEmpty) const _Tile(icon: Icons.lock_outline_rounded, title: 'Tickets', subtitle: 'No access'),
                _Tile(
                  icon: Icons.folder_copy_outlined,
                  title: 'Projects',
                  subtitle: me.projects.isEmpty ? 'None assigned' : '${me.projects.length} project(s)',
                  onTap: () => homeTab.value = 2,
                ),
              ],
            ],
          ),
          const SizedBox(height: 20),
          const _Label('Settings'),
          _Group(
            children: [
              ValueListenableBuilder(
                valueListenable: themeController,
                builder: (context, mode, _) => _Tile(
                  icon: Icons.palette_outlined,
                  title: 'Theme',
                  trailing: SegmentedButton<ThemeMode>(
                    showSelectedIcon: false,
                    style: const ButtonStyle(visualDensity: VisualDensity.compact),
                    segments: const [
                      ButtonSegment(value: ThemeMode.light, icon: Icon(Icons.light_mode_outlined, size: 18)),
                      ButtonSegment(value: ThemeMode.system, icon: Icon(Icons.brightness_auto_outlined, size: 18)),
                      ButtonSegment(value: ThemeMode.dark, icon: Icon(Icons.dark_mode_outlined, size: 18)),
                    ],
                    selected: {mode},
                    onSelectionChanged: (s) => themeController.set(s.first),
                  ),
                ),
              ),
              _Tile(
                icon: Icons.notifications_active_outlined,
                title: 'Send test notification',
                subtitle: 'Only to this phone',
                trailing: _testing ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : null,
                onTap: _testing ? null : _test,
              ),
              _Tile(icon: Icons.lock_reset_rounded, title: 'Change password', subtitle: 'Email me a reset link', onTap: _resetPassword),
            ],
          ),
          const SizedBox(height: 20),
          _Group(
            children: [_Tile(icon: Icons.logout_rounded, title: 'Log out', danger: true, onTap: _signOut)],
          ),
        ],
      ),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip(this.label, this.color);
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
    decoration: BoxDecoration(color: color.withValues(alpha: .13), borderRadius: BorderRadius.circular(20)),
    child: Text(
      label,
      style: TextStyle(color: color, fontWeight: FontWeight.w700, fontSize: 12),
    ),
  );
}

class _Label extends StatelessWidget {
  const _Label(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(left: 4, bottom: 8),
    child: Text(
      text.toUpperCase(),
      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: .6, color: Wa.muted(context)),
    ),
  );
}

class _Group extends StatelessWidget {
  const _Group({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => Container(
    decoration: BoxDecoration(
      color: Wa.surface(context),
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: Wa.border(context)),
    ),
    clipBehavior: Clip.antiAlias,
    child: Column(
      children: [
        for (var i = 0; i < children.length; i++) ...[if (i > 0) Divider(height: 1, indent: 56, color: Wa.border(context)), children[i]],
      ],
    ),
  );
}

class _Tile extends StatelessWidget {
  const _Tile({required this.icon, required this.title, this.subtitle, this.trailing, this.onTap, this.danger = false});
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget? trailing;
  final VoidCallback? onTap;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final c = danger ? Theme.of(context).colorScheme.error : Wa.text(context);
    return ListTile(
      onTap: onTap,
      leading: Icon(icon, color: danger ? c : Wa.accent),
      title: Text(
        title,
        style: TextStyle(fontWeight: FontWeight.w600, color: c),
      ),
      subtitle: subtitle == null ? null : Text(subtitle!, style: TextStyle(color: Wa.muted(context), fontSize: 12.5)),
      trailing: trailing ?? (onTap != null && !danger ? Icon(Icons.chevron_right_rounded, color: Wa.muted(context)) : null),
    );
  }
}
