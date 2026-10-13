import 'dart:convert';
import 'dart:typed_data';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import 'ticket_repository.dart' show Person;

/// Core `projects/{id}` — web `src/context/projects.ts` sarkha: built-in (NOAI, code madhe) + super admin
/// ne add kelele. `builtIn: true` doc = built-in project chi overview mahiti (overlay).

const projectStatusLabels = {'planning': 'Planning', 'rnd': 'R&D', 'development': 'Development', 'testing': 'Testing', 'active': 'Active', 'onHold': 'On Hold'};

const projectStatusColors = {
  'planning': Color(0xFF94A3B8),
  'rnd': Color(0xFFD946EF),
  'development': Color(0xFF6366F1),
  'testing': Color(0xFFF59E0B),
  'active': Color(0xFF10B981),
  'onHold': Color(0xFFF43F5E),
};

const projectTypeLabels = {
  'webApp': 'Web app',
  'mobileApp': 'Mobile app',
  'webMobile': 'Web + Mobile app',
  'marketplace': 'Marketplace',
  'website': 'Website',
  'internal': 'Internal tool',
  'other': 'Other',
};

class Project {
  const Project({
    required this.id,
    required this.name,
    this.tagline = '',
    this.accent = const Color(0xFF6366F1),
    this.logo,
    this.client = '',
    this.description = '',
    this.status,
    this.type,
    this.startDate,
    this.endDate,
    this.manager,
    this.team = const [],
  });

  factory Project.fromMap(String id, Map<String, dynamic> d, {Project? base}) {
    final logo = d['logo'] is String ? d['logo'] as String : null;
    return Project(
      id: id,
      name: (d['name'] as String?)?.isNotEmpty == true ? d['name'] as String : (base?.name ?? id),
      tagline: (d['tagline'] as String?) ?? base?.tagline ?? '',
      accent: _color(d['accent']) ?? base?.accent ?? const Color(0xFF6366F1),
      logo: logo != null && logo.contains(',') ? _bytes(logo) : null,
      client: '${d['client'] ?? ''}',
      description: '${d['description'] ?? ''}',
      status: projectStatusLabels.containsKey(d['status']) ? d['status'] as String : null,
      type: projectTypeLabels.containsKey(d['projectType']) ? d['projectType'] as String : null,
      startDate: d['startDate'] as String?,
      endDate: d['endDate'] as String?,
      manager: Person.of(d['manager']),
      team: ((d['team'] as List?) ?? const []).map(Person.of).whereType<Person>().toList(),
    );
  }

  final String id;
  final String name;
  final String tagline;
  final Color accent;

  /// `data:image/...;base64,` logo.
  final Uint8List? logo;
  final String client;
  final String description;
  final String? status;
  final String? type;
  final String? startDate;
  final String? endDate;
  final Person? manager;
  final List<Person> team;
}

Color? _color(Object? v) {
  if (v is! String || !RegExp(r'^#[0-9a-fA-F]{6}$').hasMatch(v)) return null;
  return Color(int.parse('FF${v.substring(1)}', radix: 16));
}

Uint8List? _bytes(String dataUrl) {
  try {
    return base64Decode(dataUrl.substring(dataUrl.indexOf(',') + 1));
  } catch (_) {
    return null;
  }
}

/// Code madhle projects (web `BUILT_IN_PROJECTS`).
const _builtIn = [Project(id: 'noai', name: 'NOAI', tagline: 'Workforce marketplace')];

class ProjectRepository {
  final _db = FirebaseFirestore.instance;

  /// Sagle projects live (built-in pahile, mag naav kramane).
  Stream<List<Project>> all() => _db.collection('projects').snapshots().map((s) {
    final overlay = {for (final d in s.docs.where((d) => d.data()['builtIn'] == true)) d.id: d.data()};
    final added = s.docs.where((d) => d.data()['builtIn'] != true).map((d) => Project.fromMap(d.id, d.data())).toList()
      ..sort((a, b) => a.name.toLowerCase().compareTo(b.name.toLowerCase()));
    return [for (final p in _builtIn) overlay[p.id] == null ? p : Project.fromMap(p.id, overlay[p.id]!, base: p), ...added];
  });
}
