import 'package:flutter/material.dart';

import '../../../app/locator.dart';
import '../../../app/theme.dart';
import '../../../data/chat_repository.dart';

/// Web `Avatar` sarkha — naav nusar gradient + initials. `hero` dila tar list → chat madhe udto.
class Avatar extends StatelessWidget {
  const Avatar({super.key, required this.name, required this.seed, this.radius = 20, this.hero = false});
  final String name;
  final String seed;
  final double radius;
  final bool hero;

  @override
  Widget build(BuildContext context) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    final initials = parts.isEmpty ? '?' : (parts.length == 1 ? parts[0][0] : '${parts[0][0]}${parts[1][0]}').toUpperCase();
    final circle = Container(
      width: radius * 2,
      height: radius * 2,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: Wa.personGradient(seed)),
      ),
      child: Text(
        initials,
        style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600, fontSize: radius * .68, letterSpacing: .3, decoration: TextDecoration.none),
      ),
    );
    return hero ? Hero(tag: 'avatar-$seed', child: circle) : circle;
  }
}

/// Group — photo asel tar photo, nahitar gradient var "lok" icon (web `GroupAvatar` sarkha).
class GroupAvatar extends StatelessWidget {
  const GroupAvatar({super.key, required this.seed, this.radius = 20, this.hero = false, this.photo});
  final String seed;
  final double radius;
  final bool hero;

  /// Storage path (`ChatSummary.photo`).
  final String? photo;

  @override
  Widget build(BuildContext context) {
    final fallback = Container(
      width: radius * 2,
      height: radius * 2,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: Wa.personGradient(seed)),
      ),
      child: Icon(Icons.groups_rounded, color: Colors.white, size: radius * 1.05),
    );
    final p = photo;
    final circle = p == null || p.isEmpty
        ? fallback
        : FutureBuilder<String>(
            future: locator<ChatRepository>().photoUrl(p),
            builder: (_, snap) => snap.data == null || snap.data!.isEmpty
                ? fallback
                : ClipOval(
                    child: Image.network(
                      snap.data!,
                      width: radius * 2,
                      height: radius * 2,
                      fit: BoxFit.cover,
                      errorBuilder: (_, _, _) => fallback,
                    ),
                  ),
          );
    return hero ? Hero(tag: 'avatar-$seed', child: circle) : circle;
  }
}
