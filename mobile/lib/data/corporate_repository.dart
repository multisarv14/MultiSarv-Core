import 'dart:io';

import 'package:firebase_storage/firebase_storage.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:mime/mime.dart';
import 'package:path_provider/path_provider.dart';

import '../core/backend.dart';

/// Corporate Affairs — fakt super admin. Web `src/api/corporate.ts` sarkhech: sagle reads / writes
/// core `corp*` callables (Firestore rules client la `corp_*` detch nahit). Schema server deto
/// (`core/functions/src/corporateSchema.ts`) — forms / lists tyavarunch banatat.

class CorpOption {
  const CorpOption(this.value, this.label);
  final String value;
  final String label;
}

class CorpField {
  CorpField.fromMap(Map<Object?, Object?> m)
    : key = '${m['key']}',
      label = '${m['label']}',
      type = '${m['type']}',
      required = m['required'] == true,
      options = [for (final o in (m['options'] as List? ?? const [])) CorpOption('${(o as Map)['value']}', '${o['label']}')],
      ref = m['ref'] as String?,
      pattern = m['pattern'] as String?,
      list = m['list'] == true,
      filter = m['filter'] == true,
      max = (m['max'] as num?)?.toInt(),
      hint = m['hint'] as String?;

  final String key;
  final String label;

  /// text, textarea, number, money, percent, date, select, email, phone, url, ref, bool.
  final String type;
  final bool required;
  final List<CorpOption> options;
  final String? ref;
  final String? pattern;
  final bool list;
  final bool filter;
  final int? max;
  final String? hint;

  bool get isNumber => type == 'number' || type == 'money' || type == 'percent';

  String optionLabel(Object? v) => options.where((o) => o.value == v).firstOrNull?.label ?? '${v ?? ''}';
}

class CorpKind {
  CorpKind.fromMap(Map<Object?, Object?> m)
    : kind = '${m['kind']}',
      section = '${m['section']}',
      label = '${m['label']}',
      singular = '${m['singular']}',
      titleField = '${m['titleField']}',
      dateField = m['dateField'] as String?,
      singleton = m['singleton'] == true,
      computed = [for (final c in (m['computed'] as List? ?? const [])) CorpField.fromMap(c as Map)],
      fields = [for (final f in (m['fields'] as List? ?? const [])) CorpField.fromMap(f as Map)];

  final String kind;
  final String section;
  final String label;
  final String singular;
  final String titleField;
  final String? dateField;
  final bool singleton;
  final List<CorpField> computed;
  final List<CorpField> fields;

  CorpField? field(String key) => fields.where((f) => f.key == key).firstOrNull ?? computed.where((f) => f.key == key).firstOrNull;
}

class CorpSection {
  CorpSection.fromMap(Map<Object?, Object?> m) : key = '${m['key']}', label = '${m['label']}', kinds = [for (final k in (m['kinds'] as List)) '$k'];
  final String key;
  final String label;
  final List<String> kinds;
}

class CorpSchema {
  CorpSchema.fromMap(Map<Object?, Object?> m)
    : sections = [for (final s in (m['sections'] as List)) CorpSection.fromMap(s as Map)],
      kinds = [for (final k in (m['kinds'] as List)) CorpKind.fromMap(k as Map)],
      patterns = {for (final e in ((m['patterns'] as Map?) ?? const {}).entries) '${e.key}': '${e.value}'};

  final List<CorpSection> sections;
  final List<CorpKind> kinds;
  final Map<String, String> patterns;

  CorpKind kind(String k) => kinds.firstWhere((x) => x.kind == k);
  CorpSection sectionOf(String kind) => sections.firstWhere((s) => s.kinds.contains(kind));
}

class CorpFile {
  CorpFile.fromMap(Map<Object?, Object?> m)
    : id = '${m['id']}',
      name = '${m['name']}',
      size = (m['size'] as num?)?.toInt() ?? 0,
      type = '${m['type'] ?? ''}',
      byName = '${m['byName'] ?? ''}',
      uploadedAt = m['uploadedAt'] is num ? DateTime.fromMillisecondsSinceEpoch((m['uploadedAt'] as num).toInt()) : null;
  final String id;
  final String name;
  final int size;
  final String type;
  final String byName;
  final DateTime? uploadedAt;
}

/// Server row — fields + `_title`, `_refs`, computed, meta.
class CorpRow {
  CorpRow(Map<Object?, Object?> m) : data = {for (final e in m.entries) '${e.key}': e.value};
  final Map<String, Object?> data;

  String get id => '${data['id']}';
  String get title => '${data['_title'] ?? ''}';
  bool get archived => data['archived'] == true;
  Object? operator [](String k) => data[k];
  String? ref(String key) => (data['_refs'] as Map?)?[key] as String?;
  List<CorpFile> get files => [for (final f in (data['files'] as List? ?? const [])) CorpFile.fromMap(f as Map)];
  DateTime? _ms(String k) => data[k] is num ? DateTime.fromMillisecondsSinceEpoch((data[k] as num).toInt()) : null;
  DateTime? get createdAt => _ms('createdAt');
  DateTime? get updatedAt => _ms('updatedAt');
}

class CorpChange {
  CorpChange(Map<Object?, Object?> m) : field = '${m['field']}', from = m['from'], to = m['to'];
  final String field;
  final Object? from;
  final Object? to;
}

class CorpHistory {
  CorpHistory(Map<Object?, Object?> m)
    : id = '${m['id']}',
      kind = '${m['kind']}',
      recordId = '${m['recordId']}',
      recordTitle = '${m['recordTitle'] ?? ''}',
      action = '${m['action']}',
      byName = '${m['byName'] ?? m['byEmail'] ?? ''}',
      reason = m['reason'] as String?,
      fileName = (m['file'] as Map?)?['name'] as String?,
      changes = [for (final c in (m['changes'] as List? ?? const [])) CorpChange(c as Map)],
      at = m['at'] is num ? DateTime.fromMillisecondsSinceEpoch((m['at'] as num).toInt()) : null;
  final String id;
  final String kind;
  final String recordId;
  final String recordTitle;
  final String action;
  final String byName;
  final String? reason;
  final String? fileName;
  final List<CorpChange> changes;
  final DateTime? at;

  static const actions = {
    'create': 'created',
    'update': 'updated',
    'archive': 'archived',
    'restore': 'restored',
    'fileAdd': 'uploaded a document',
    'fileRemove': 'removed a document',
    'fileView': 'opened a document',
  };
  String get actionLabel => actions[action] ?? action;
}

class CorpPage {
  CorpPage(Map<Object?, Object?> m)
    : rows = [for (final r in (m['rows'] as List)) CorpRow(r as Map)],
      total = (m['total'] as num).toInt(),
      totals = {for (final e in ((m['totals'] as Map?) ?? const {}).entries) '${e.key}': (e.value as num).toDouble()};
  final List<CorpRow> rows;
  final int total;
  final Map<String, double> totals;
}

class CorpRecord {
  CorpRecord(Map<Object?, Object?> m)
    : record = m['record'] == null ? null : CorpRow(m['record'] as Map),
      history = [for (final h in (m['history'] as List? ?? const [])) CorpHistory(h as Map)],
      related = [
        for (final r in (m['related'] as List? ?? const []))
          (kind: '${(r as Map)['kind']}', field: '${r['field']}', rows: [for (final x in (r['rows'] as List)) CorpRow(x as Map)]),
      ];
  final CorpRow? record;
  final List<CorpHistory> history;
  final List<({String kind, String field, List<CorpRow> rows})> related;
}

// ── Formatting / validation (web `shared.tsx` sobat same) ──

final _inr = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);
final _inr2 = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);
final _num = NumberFormat.decimalPattern('en_IN');
final _date = DateFormat('d MMM y');

String corpMoney(num v) => (v % 1 == 0 ? _inr : _inr2).format(v);

/// "₹1.2Cr" — chhote cards sathi.
String corpMoneyShort(num v) {
  final a = v.abs();
  if (a >= 1e7) return '₹${(v / 1e7).toStringAsFixed(a >= 1e8 ? 0 : 1)}Cr';
  if (a >= 1e5) return '₹${(v / 1e5).toStringAsFixed(a >= 1e6 ? 0 : 1)}L';
  if (a >= 1e3) return '₹${(v / 1e3).toStringAsFixed(a >= 1e4 ? 0 : 1)}K';
  return '₹${v.round()}';
}

String corpNum(num v) => _num.format(v);

DateTime? corpDate(Object? v) => v is String && RegExp(r'^\d{4}-\d{2}-\d{2}$').hasMatch(v) ? DateTime.tryParse(v) : null;
String corpDateText(Object? v) {
  final d = corpDate(v);
  return d == null ? '' : _date.format(d);
}

String corpFileSize(int n) => n >= 1048576 ? '${(n / 1048576).toStringAsFixed(1)} MB' : '${(n / 1024).round().clamp(1, 1024)} KB';

/// Field cha vachanya-yogya text.
String corpValue(CorpField f, Object? v, {String? refTitle}) {
  if (v == null || v == '') return '';
  switch (f.type) {
    case 'money':
      return corpMoney(v as num);
    case 'percent':
      return '${(v as num).toStringAsFixed(v % 1 == 0 ? 0 : 2)}%';
    case 'number':
      return corpNum(v as num);
    case 'date':
      return corpDateText(v);
    case 'bool':
      return v == true ? 'Yes' : 'No';
    case 'select':
      return f.optionLabel(v);
    case 'ref':
      return refTitle ?? '$v';
    default:
      return '$v';
  }
}

const _tones = {
  'active': Color(0xFF10B981),
  'completed': Color(0xFF10B981),
  'passed': Color(0xFF10B981),
  'held': Color(0xFF10B981),
  'filed': Color(0xFF10B981),
  'received': Color(0xFF10B981),
  'signed': Color(0xFF10B981),
  'pending': Color(0xFFF59E0B),
  'adjourned': Color(0xFFF59E0B),
  'objected': Color(0xFFF59E0B),
  'scheduled': Color(0xFF0EA5E9),
  'proposed': Color(0xFF0EA5E9),
  'prospect': Color(0xFF0EA5E9),
  'expired': Color(0xFFF43F5E),
  'disqualified': Color(0xFFF43F5E),
  'rejected': Color(0xFFF43F5E),
  'cancelled': Color(0xFFF43F5E),
  'refunded': Color(0xFFF43F5E),
  'terminated': Color(0xFFF43F5E),
};
Color corpTone(Object? v) => _tones['$v'] ?? const Color(0xFF94A3B8);

final _email = RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$');
final _phone = RegExp(r'^\+?[\d\s()-]{6,20}$');
const _examples = {'pan': 'AAAAA0000A', 'tan': 'AAAA00000A', 'gstin': '27AAAAA0000A1Z5', 'cin': 'U72900MH2020PTC123456', 'din': '01234567'};

String? corpValidate(CorpField f, Object? v, CorpSchema schema) {
  final empty = v == null || (v is String && v.trim().isEmpty);
  if (empty) return f.required && f.type != 'bool' ? 'Required' : null;
  final s = v is String ? v.trim() : '$v';
  switch (f.type) {
    case 'text':
    case 'textarea':
      final max = f.max ?? (f.type == 'text' ? 200 : 5000);
      if (s.length > max) return 'Max $max characters';
      if (f.pattern != null && !RegExp(schema.patterns[f.pattern]!).hasMatch(s.toUpperCase().replaceAll(RegExp(r'\s+'), ''))) {
        return 'Format: ${f.hint ?? _examples[f.pattern] ?? ''}';
      }
      return null;
    case 'email':
      return _email.hasMatch(s) ? null : 'Enter a valid email';
    case 'phone':
      return _phone.hasMatch(s) ? null : 'Enter a valid phone number';
    case 'url':
      return RegExp(r'^(https?://)?[^\s/$.?#].[^\s]*$', caseSensitive: false).hasMatch(s) ? null : 'Enter a valid URL';
    case 'number':
    case 'money':
    case 'percent':
      final n = num.tryParse(s.replaceAll(',', ''));
      if (n == null || n < 0) return 'Enter a positive number';
      if (f.type == 'percent' && n > 100) return 'Must be 0–100';
      return null;
  }
  return null;
}

String? corpExample(String? pattern) => _examples[pattern];

/// Prakar-nihay disnare fields (server pan hech kadhto).
bool corpVisible(String kind, CorpField f, Map<String, Object?> form) {
  if (kind == 'shareTxns') {
    final type = '${form['type'] ?? ''}';
    if (f.key == 'fromHolder') return const ['transfer', 'transmission', 'buyback'].contains(type);
    if (f.key == 'toHolder') return type != 'buyback';
  }
  if (kind == 'compliance' && (f.key == 'filedDate' || f.key == 'srn')) return form['status'] == 'filed';
  if (kind == 'directors' && f.key == 'resignationDate') return form['status'] != 'active' || (form['resignationDate'] ?? '') != '';
  if (kind == 'resolutions' && f.key == 'filingRef') return form['filingRequired'] == true;
  return true;
}

// ── Repository ──

class CorporateRepository {
  final _storage = FirebaseStorage.instance;
  Future<CorpSchema>? _schema;

  Future<CorpSchema> schema() => _schema ??= callCore<Map<Object?, Object?>>('corpSchema').then(CorpSchema.fromMap).catchError((Object e) {
    _schema = null;
    throw e;
  });

  Future<CorpPage> list(
    String kind, {
    String q = '',
    Map<String, String> filters = const {},
    String? from,
    String? to,
    bool archived = false,
    int offset = 0,
    int limit = 25,
  }) => callCore<Map<Object?, Object?>>('corpList', {
    'kind': kind,
    if (q.trim().isNotEmpty) 'q': q.trim(),
    'filters': filters,
    'from': ?from,
    'to': ?to,
    'archived': archived,
    'offset': offset,
    'limit': limit,
  }).then(CorpPage.new);

  Future<CorpRecord> get(String kind, String id) => callCore<Map<Object?, Object?>>('corpGet', {'kind': kind, 'id': id}).then(CorpRecord.new);

  Future<List<({String id, String title})>> options(String kind) => callCore<List<Object?>>('corpOptions', {
    'kind': kind,
  }).then((l) => [for (final o in l) (id: '${(o as Map)['id']}', title: '${o['title']}')]);

  Future<Map<Object?, Object?>> report() => callCore<Map<Object?, Object?>>('corpReport');

  Future<({List<CorpHistory> rows, int total})> history({String? kind, String? action, String q = '', int offset = 0, int limit = 30}) =>
      callCore<Map<Object?, Object?>>('corpHistory', {
        'kind': ?kind,
        'action': ?action,
        if (q.trim().isNotEmpty) 'q': q.trim(),
        'offset': offset,
        'limit': limit,
      }).then((m) => (rows: [for (final h in (m['rows'] as List)) CorpHistory(h as Map)], total: (m['total'] as num).toInt()));

  /// `nextId` — recurring compliance filed zala ki pudhcha item.
  Future<({String id, bool changed, String? nextId})> save(String kind, String? id, Map<String, Object?> data) =>
      callCore<Map<Object?, Object?>>('corpSave', {
        'kind': kind,
        'id': id,
        'data': data,
      }).then((r) => (id: '${r['id']}', changed: r['changed'] != false, nextId: r['nextId'] as String?));

  Future<void> archive(String kind, String id, {required bool archived, String reason = ''}) =>
      callCore<Object?>('corpArchive', {'kind': kind, 'id': id, 'archived': archived, 'reason': reason});

  /// Storage rules: fakt super admin, 25 MB, record asel tarach.
  static const maxFile = 25 * 1024 * 1024;

  Future<void> upload(String kind, String id, File file, String name) async {
    if (await file.length() > maxFile) throw AppError('File is larger than 25 MB.');
    final safe = name.replaceAll(RegExp(r'[^\w.\-() ]+'), '_');
    final path = 'corporate/$kind/$id/${DateTime.now().millisecondsSinceEpoch}-${safe.length > 120 ? safe.substring(safe.length - 120) : safe}';
    final type = lookupMimeType(name) ?? 'application/octet-stream';
    await _storage.ref(path).putFile(file, SettableMetadata(contentType: type));
    await callCore<Object?>('corpAttach', {'kind': kind, 'id': id, 'path': path, 'name': name});
  }

  Future<void> removeFile(String kind, String id, String fileId) => callCore<Object?>('corpDetach', {'kind': kind, 'id': id, 'fileId': fileId});

  /// Adhi audit (`corpFileOpen`), mag Storage madhun (rules) — app cha temp folder madhe.
  /// Public download link vaparat nahi.
  Future<File> download(String kind, String id, CorpFile f) async {
    final meta = await callCore<Map<Object?, Object?>>('corpFileOpen', {'kind': kind, 'id': id, 'fileId': f.id});
    final bytes = await _storage.ref('${meta['path']}').getData(maxFile + 1024);
    if (bytes == null) throw AppError('This document is invalid or missing.');
    final dir = Directory('${(await getTemporaryDirectory()).path}/corporate');
    if (await dir.exists()) await dir.delete(recursive: true);
    await dir.create(recursive: true);
    final out = File('${dir.path}/${f.name.replaceAll(RegExp(r'[^\w.\- ]'), '_')}');
    await out.writeAsBytes(bytes, flush: true);
    return out;
  }

  /// Logout — dusrya user la juna schema nako.
  void clear() => _schema = null;
}
