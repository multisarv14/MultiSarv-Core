import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter/material.dart';

import '../../app/locator.dart';
import '../../app/theme.dart';
import '../../core/backend.dart';
import '../../data/corporate_repository.dart';
import '../../services/session_service.dart';
import 'corporate_list_view.dart';
import 'corporate_record_view.dart';
import 'corporate_widgets.dart';

/// Corporate Affairs (web `/corporate`) — fakt super admin. Reports + 10 sections + audit log.
/// Server pan pratyek call la super admin tapasto; ithe fakt UI.
class CorporateHomeView extends StatefulWidget {
  const CorporateHomeView({super.key});

  @override
  State<CorporateHomeView> createState() => _CorporateHomeViewState();
}

class _CorporateHomeViewState extends State<CorporateHomeView> {
  final _repo = locator<CorporateRepository>();
  final bool _super = locator<SessionService>().me.superAdmin;
  CorpSchema? _schema;
  Map<Object?, Object?>? _report;
  String? _error;

  @override
  void initState() {
    super.initState();
    if (_super) _load();
  }

  Future<void> _load() async {
    setState(() => _error = null);
    try {
      final r = await Future.wait([_repo.schema(), _repo.report()]);
      if (!mounted) return;
      setState(() {
        _schema = r[0] as CorpSchema;
        _report = r[1] as Map<Object?, Object?>;
      });
    } catch (e) {
      if (mounted) setState(() => _error = errorText(e));
    }
  }

  Future<void> _open(String kind, String id) async {
    final changed = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => CorporateRecordView(schema: _schema!, kind: kind, id: id)));
    if (changed == true) _load();
  }

  Future<void> _section(CorpSection s) async {
    if (s.key == 'company') {
      // Navin profile — Settings → Company (branding) madhun adhi bharun.
      Map<String, Object?>? preset;
      try {
        final c = (await FirebaseFirestore.instance.collection('settings').doc('company').get()).data();
        if (c != null) {
          preset = {
            'name': c['name'],
            'pan': c['pan'],
            'gstin': c['gstin'],
            'email': c['email'],
            'phone': c['phone'],
            'website': c['website'],
            'registeredAddress': [c['address'], c['city'], c['state'], c['pincode'], c['country']].where((x) => x is String && x.isNotEmpty).join(', '),
          };
        }
      } catch (_) {}
      if (!mounted) return;
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => CorporateRecordView(schema: _schema!, kind: 'company', id: '', preset: preset)));
    } else {
      await Navigator.of(context).push(MaterialPageRoute(builder: (_) => CorporateListView(schema: _schema!, section: s)));
    }
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final appBar = AppBar(
      backgroundColor: Wa.bg(context),
      title: const Text('Corporate Affairs', style: TextStyle(fontWeight: FontWeight.w800)),
      actions: [
        if (_schema != null)
          IconButton(
            tooltip: 'Audit log',
            icon: const Icon(Icons.history_rounded),
            onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => CorporateAuditView(schema: _schema!))),
          ),
      ],
    );
    if (!_super) {
      return Scaffold(
        appBar: appBar,
        body: Center(child: Text('Only super admins can open Corporate Affairs.', style: TextStyle(color: Wa.muted(context)))),
      );
    }
    final schema = _schema;
    final r = _report;
    if (_error != null && r == null) {
      return Scaffold(
        appBar: appBar,
        body: CorpError(message: _error!, onRetry: _load),
      );
    }
    if (schema == null || r == null) {
      return Scaffold(
        appBar: appBar,
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final company = r['company'] as Map?;
    final counts = (r['counts'] as Map?) ?? const {};
    final cap = (r['capital'] as Map?)?['latest'] as Map?;
    final val = (r['valuation'] as Map?)?['latest'] as Map?;
    final inv = (r['investors'] as Map?) ?? const {};
    final comp = (r['compliance'] as Map?) ?? const {};
    final due = [...(comp['overdue'] as List? ?? const []), ...(comp['upcoming'] as List? ?? const [])].cast<Map>();
    final renewals = (r['renewals'] as List? ?? const []).cast<Map>();
    final kyc = ((r['directors'] as Map?)?['kycDue'] as List? ?? const []).cast<Map>();
    final capRows = ((r['capTable'] as Map?)?['rows'] as List? ?? const []).cast<Map>();
    final recent = [for (final h in (r['recent'] as List? ?? const [])) CorpHistory(h as Map)];
    num n(Object? v) => v is num ? v : 0;

    return Scaffold(
      appBar: appBar,
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
          children: [
            Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(color: const Color(0xFF8B5CF6).withValues(alpha: .1), borderRadius: BorderRadius.circular(16)),
              child: Row(
                children: [
                  const Icon(Icons.lock_rounded, color: Color(0xFF8B5CF6)),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          company == null || '${company['name']}'.isEmpty ? 'Company profile not set up' : '${company['name']}',
                          style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15.5),
                        ),
                        Text(
                          company != null && '${company['cin']}'.isNotEmpty ? 'CIN ${company['cin']} · Super Admin only' : 'Confidential · Super Admin only',
                          style: TextStyle(fontSize: 12, color: Wa.muted(context)),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            GridView.count(
              crossAxisCount: 2,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 10,
              crossAxisSpacing: 10,
              childAspectRatio: 1.75,
              children: [
                _Stat('Active directors', corpNum(n(counts['directors'])), Icons.manage_accounts_rounded, Wa.accent),
                _Stat('Paid-up capital', cap == null ? '—' : corpMoneyShort(n(cap['paidUpCapital'])), Icons.account_balance_rounded, const Color(0xFF0EA5E9)),
                _Stat('Latest valuation', val == null ? '—' : corpMoneyShort(n(val['valuation'])), Icons.trending_up_rounded, const Color(0xFF8B5CF6)),
                _Stat(
                  'Compliance overdue',
                  '${(comp['overdue'] as List? ?? const []).length}',
                  Icons.warning_amber_rounded,
                  (comp['overdue'] as List? ?? const []).isEmpty ? const Color(0xFF10B981) : const Color(0xFFF43F5E),
                ),
                _Stat('Investment received', corpMoneyShort(n(inv['received'])), Icons.savings_rounded, const Color(0xFF10B981)),
                _Stat('Yet to receive', corpMoneyShort(n(inv['pending'])), Icons.hourglass_bottom_rounded, const Color(0xFFF59E0B)),
              ],
            ),
            const CorpLabel('Sections'),
            CorpCard(
              child: Column(
                children: [
                  for (var i = 0; i < schema.sections.length; i++) ...[
                    if (i > 0) Divider(height: 1, indent: 56, color: Wa.border(context)),
                    ListTile(
                      leading: Icon(corpSectionIcons[schema.sections[i].key] ?? Icons.folder_rounded, color: Wa.accent),
                      title: Text(schema.sections[i].label, style: const TextStyle(fontWeight: FontWeight.w600)),
                      trailing: Icon(Icons.chevron_right_rounded, color: Wa.muted(context)),
                      onTap: () => _section(schema.sections[i]),
                    ),
                  ],
                ],
              ),
            ),
            CorpLabel('Overdue & due in 30 days'),
            _list(
              due.take(10),
              (c) => ListTile(
                dense: true,
                title: Text('${c['_title']}', style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text([c['form'], corpDateText(c['dueDate'])].where((x) => x != null && '$x'.isNotEmpty).join(' · ')),
                trailing: CorpDaysBadge(n(c['daysLeft']).toInt()),
                onTap: () => _open('compliance', '${c['id']}'),
              ),
            ),
            const CorpLabel('Renewals & expiries (60 days)'),
            _list(
              renewals.take(10),
              (a) => ListTile(
                dense: true,
                title: Text('${a['_title']}', style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: Text('${schema.kind('${a['kind']}').label} · ${corpDateText(a['date'])}'),
                trailing: CorpDaysBadge(n(a['days']).toInt()),
                onTap: () => _open('${a['kind']}', '${a['id']}'),
              ),
            ),
            const CorpLabel('Director KYC due'),
            _list(
              kyc,
              (d) => ListTile(
                dense: true,
                title: Text('${d['name']}', style: const TextStyle(fontWeight: FontWeight.w600)),
                subtitle: d['din'] == null ? null : Text('DIN ${d['din']}'),
                trailing: CorpBadge(
                  d['kycStatus'] == null ? 'Not recorded' : schema.kind('directors').field('kycStatus')!.optionLabel(d['kycStatus']),
                  color: d['kycStatus'] == 'expired' ? const Color(0xFFF43F5E) : const Color(0xFFF59E0B),
                ),
                onTap: () => _open('directors', '${d['id']}'),
              ),
            ),
            CorpLabel('Cap table · ${corpNum(n((r['capTable'] as Map?)?['totalShares']))} shares'),
            if (capRows.isEmpty)
              _empty('No shares recorded — add allotments under Shareholders.')
            else
              CorpCard(
                padding: const EdgeInsets.all(14),
                child: Column(
                  children: [
                    for (final s in capRows)
                      InkWell(
                        onTap: () => _open('shareholders', '${s['id']}'),
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 6),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(
                                children: [
                                  Expanded(
                                    child: Text('${s['name']}', style: const TextStyle(fontWeight: FontWeight.w600)),
                                  ),
                                  Text(
                                    '${corpNum(n(s['shares']))} · ${n(s['percent']).toStringAsFixed(2)}%',
                                    style: TextStyle(fontSize: 12.5, color: Wa.muted(context)),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 4),
                              ClipRRect(
                                borderRadius: BorderRadius.circular(4),
                                child: LinearProgressIndicator(
                                  value: (n(s['percent']) / 100).clamp(0.01, 1).toDouble(),
                                  minHeight: 6,
                                  color: Wa.accent,
                                  backgroundColor: Wa.surface2(context),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            const CorpLabel('Recent activity'),
            _list(recent, (h) => CorpHistoryTile(h: h, schema: schema, showRecord: true, onOpen: h.action == 'archive' ? null : () => _open(h.kind, h.recordId))),
          ],
        ),
      ),
    );
  }

  Widget _empty(String text) => Padding(
    padding: const EdgeInsets.only(left: 4),
    child: Text(text, style: TextStyle(color: Wa.muted(context))),
  );

  Widget _list<T>(Iterable<T> items, Widget Function(T) row) {
    final list = items.toList();
    if (list.isEmpty) return _empty('Nothing here right now');
    return CorpCard(
      child: Column(
        children: [
          for (var i = 0; i < list.length; i++) ...[if (i > 0) Divider(height: 1, color: Wa.border(context)), row(list[i])],
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.label, this.value, this.icon, this.color);
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(
      color: Wa.surface(context),
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: Wa.border(context)),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(label, maxLines: 2, style: TextStyle(fontSize: 12, color: Wa.muted(context))),
            ),
            Icon(icon, size: 18, color: color),
          ],
        ),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(value, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
        ),
      ],
    ),
  );
}

/// Sagle Corporate Affairs badal — prakar / kriya filter, search, pages.
class CorporateAuditView extends StatefulWidget {
  const CorporateAuditView({super.key, required this.schema});
  final CorpSchema schema;

  @override
  State<CorporateAuditView> createState() => _CorporateAuditViewState();
}

class _CorporateAuditViewState extends State<CorporateAuditView> {
  final _repo = locator<CorporateRepository>();
  final _scroll = ScrollController();
  Timer? _debounce;
  String? _kind;
  String? _action;
  String _q = '';
  List<CorpHistory>? _rows;
  int _total = 0;
  String? _error;
  bool _more = false;
  int _gen = 0;

  @override
  void initState() {
    super.initState();
    _load();
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 300) _loadMore();
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    final gen = ++_gen;
    setState(() => _error = null);
    try {
      final r = await _repo.history(kind: _kind, action: _action, q: _q);
      if (mounted && gen == _gen) {
        setState(() {
          _rows = r.rows;
          _total = r.total;
        });
      }
    } catch (e) {
      if (mounted && gen == _gen) setState(() => _error = errorText(e));
    }
  }

  Future<void> _loadMore() async {
    final rows = _rows;
    if (rows == null || _more || rows.length >= _total) return;
    final gen = _gen;
    setState(() => _more = true);
    try {
      final r = await _repo.history(kind: _kind, action: _action, q: _q, offset: rows.length);
      if (mounted && gen == _gen) setState(() => _rows = [...rows, ...r.rows]);
    } catch (_) {
    } finally {
      if (mounted) setState(() => _more = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final rows = _rows;
    return Scaffold(
      appBar: AppBar(
        backgroundColor: Wa.bg(context),
        title: const Text('Audit log', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          controller: _scroll,
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.only(bottom: 40),
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 6),
              child: TextField(
                decoration: const InputDecoration(hintText: 'Search record or person', prefixIcon: Icon(Icons.search_rounded), isDense: true),
                onChanged: (v) {
                  _debounce?.cancel();
                  _debounce = Timer(const Duration(milliseconds: 350), () {
                    _q = v;
                    _load();
                  });
                },
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: Row(
                children: [
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _kind ?? '',
                      isExpanded: true,
                      decoration: const InputDecoration(isDense: true, labelText: 'Record type'),
                      items: [
                        const DropdownMenuItem(value: '', child: Text('All')),
                        for (final k in widget.schema.kinds) DropdownMenuItem(value: k.kind, child: Text(k.label, overflow: TextOverflow.ellipsis)),
                      ],
                      onChanged: (v) {
                        _kind = v == null || v.isEmpty ? null : v;
                        _load();
                      },
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: DropdownButtonFormField<String>(
                      initialValue: _action ?? '',
                      isExpanded: true,
                      decoration: const InputDecoration(isDense: true, labelText: 'Action'),
                      items: [
                        const DropdownMenuItem(value: '', child: Text('All')),
                        for (final e in CorpHistory.actions.entries) DropdownMenuItem(value: e.key, child: Text(e.value, overflow: TextOverflow.ellipsis)),
                      ],
                      onChanged: (v) {
                        _action = v == null || v.isEmpty ? null : v;
                        _load();
                      },
                    ),
                  ),
                ],
              ),
            ),
            if (_error != null && rows == null)
              Padding(
                padding: const EdgeInsets.only(top: 60),
                child: CorpError(message: _error!, onRetry: _load),
              )
            else if (rows == null)
              const Padding(
                padding: EdgeInsets.only(top: 80),
                child: Center(child: CircularProgressIndicator()),
              )
            else if (rows.isEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 80),
                child: Center(child: Text('No history', style: TextStyle(color: Wa.muted(context)))),
              )
            else ...[
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 6),
                child: Text('$_total entries', style: TextStyle(fontSize: 12, color: Wa.muted(context), fontWeight: FontWeight.w600)),
              ),
              for (var i = 0; i < rows.length; i++) ...[
                if (i > 0) Divider(height: 1, indent: 56, color: Wa.border(context)),
                CorpHistoryTile(
                  h: rows[i],
                  schema: widget.schema,
                  showRecord: true,
                  onOpen: rows[i].action == 'archive'
                      ? null
                      : () => Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => CorporateRecordView(schema: widget.schema, kind: rows[i].kind, id: rows[i].kind == 'company' ? '' : rows[i].recordId)),
                        ),
                ),
              ],
              if (_more) const Padding(padding: EdgeInsets.all(16), child: Center(child: CircularProgressIndicator())),
            ],
          ],
        ),
      ),
    );
  }
}
