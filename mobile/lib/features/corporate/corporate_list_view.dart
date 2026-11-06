import 'dart:async';

import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../app/locator.dart';
import '../../app/theme.dart';
import '../../core/backend.dart';
import '../../data/corporate_repository.dart';
import 'corporate_form_view.dart';
import 'corporate_record_view.dart';
import 'corporate_widgets.dart';

/// Ek section (Directors, Shareholders …) — kinds = tabs (web `/corporate/:section`).
class CorporateListView extends StatelessWidget {
  const CorporateListView({super.key, required this.schema, required this.section});
  final CorpSchema schema;
  final CorpSection section;

  @override
  Widget build(BuildContext context) {
    final kinds = [for (final k in section.kinds) schema.kind(k)];
    final title = Text(section.label, style: const TextStyle(fontWeight: FontWeight.w700));
    if (kinds.length == 1) {
      return Scaffold(
        appBar: AppBar(backgroundColor: Wa.bg(context), title: title),
        body: CorpKindList(schema: schema, kind: kinds.first),
      );
    }
    return DefaultTabController(
      length: kinds.length,
      child: Scaffold(
        appBar: AppBar(
          backgroundColor: Wa.bg(context),
          title: title,
          bottom: TabBar(
            labelColor: Wa.accent,
            indicatorColor: Wa.accent,
            unselectedLabelColor: Wa.muted(context),
            dividerColor: Wa.border(context),
            tabs: [for (final k in kinds) Tab(text: k.label)],
          ),
        ),
        body: TabBarView(children: [for (final k in kinds) CorpKindList(schema: schema, kind: k)]),
      ),
    );
  }
}

/// Ekach kind — search, filters, tarikh range, archived, pages (khali scroll = pudhche).
class CorpKindList extends StatefulWidget {
  const CorpKindList({super.key, required this.schema, required this.kind});
  final CorpSchema schema;
  final CorpKind kind;

  @override
  State<CorpKindList> createState() => _CorpKindListState();
}

class _CorpKindListState extends State<CorpKindList> with AutomaticKeepAliveClientMixin {
  static const _page = 25;
  final _repo = locator<CorporateRepository>();
  final _scroll = ScrollController();
  Timer? _debounce;

  String _q = '';
  final Map<String, String> _filters = {};
  DateTimeRange? _range;
  bool _archived = false;

  List<CorpRow>? _rows;
  int _total = 0;
  Map<String, double> _totals = const {};
  String? _error;
  bool _loadingMore = false;

  /// Juna request (filter badalla) cha result nako.
  int _gen = 0;

  CorpKind get _kind => widget.kind;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _load();
    _scroll.addListener(() {
      if (_scroll.position.pixels > _scroll.position.maxScrollExtent - 300) _more();
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _scroll.dispose();
    super.dispose();
  }

  String? _ymd(DateTime? d) => d == null ? null : DateFormat('yyyy-MM-dd').format(d);

  Future<void> _load() async {
    final gen = ++_gen;
    setState(() => _error = null);
    try {
      final p = await _repo.list(
        _kind.kind,
        q: _q,
        filters: _filters,
        from: _ymd(_range?.start),
        to: _ymd(_range?.end),
        archived: _archived,
        limit: _page,
      );
      if (!mounted || gen != _gen) return;
      setState(() {
        _rows = p.rows;
        _total = p.total;
        _totals = p.totals;
      });
    } catch (e) {
      if (mounted && gen == _gen) setState(() => _error = errorText(e));
    }
  }

  Future<void> _more() async {
    final rows = _rows;
    if (rows == null || _loadingMore || rows.length >= _total) return;
    final gen = _gen;
    setState(() => _loadingMore = true);
    try {
      final p = await _repo.list(
        _kind.kind,
        q: _q,
        filters: _filters,
        from: _ymd(_range?.start),
        to: _ymd(_range?.end),
        archived: _archived,
        offset: rows.length,
        limit: _page,
      );
      if (mounted && gen == _gen) setState(() => _rows = [...rows, ...p.rows]);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(e))));
    } finally {
      if (mounted) setState(() => _loadingMore = false);
    }
  }

  void _search(String v) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      _q = v;
      _load();
    });
  }

  Future<void> _pickFilter(CorpField f) async {
    List<({String value, String label})> options;
    if (f.type == 'ref') {
      try {
        options = [for (final o in await _repo.options(f.ref!)) (value: o.id, label: o.title)];
      } catch (e) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(errorText(e))));
        return;
      }
    } else if (f.type == 'bool') {
      options = const [(value: 'true', label: 'Yes'), (value: 'false', label: 'No')];
    } else {
      options = [for (final o in f.options) (value: o.value, label: o.label)];
    }
    if (!mounted) return;
    final picked = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(ctx).height * .7),
          child: ListView(
            shrinkWrap: true,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 8),
                child: Text(f.label, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
              ),
              ListTile(
                title: const Text('All'),
                trailing: _filters[f.key] == null ? const Icon(Icons.check_rounded, color: Wa.accent) : null,
                onTap: () => Navigator.pop(ctx, ''),
              ),
              for (final o in options)
                ListTile(
                  title: Text(o.label),
                  trailing: _filters[f.key] == o.value ? const Icon(Icons.check_rounded, color: Wa.accent) : null,
                  onTap: () => Navigator.pop(ctx, o.value),
                ),
            ],
          ),
        ),
      ),
    );
    if (picked == null) return;
    setState(() => picked.isEmpty ? _filters.remove(f.key) : _filters[f.key] = picked);
    _load();
  }

  Future<void> _pickRange() async {
    final r = await showDateRangePicker(context: context, firstDate: DateTime(1950), lastDate: DateTime(2100), initialDateRange: _range);
    if (r == null) return;
    setState(() => _range = r);
    _load();
  }

  Future<void> _open(String kind, String id) async {
    final changed = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => CorporateRecordView(schema: widget.schema, kind: kind, id: id)));
    if (changed == true) _load();
  }

  Future<void> _add() async {
    final id = await Navigator.of(context).push<String>(MaterialPageRoute(builder: (_) => CorporateFormView(schema: widget.schema, kind: _kind)));
    if (id != null) {
      _load();
      _open(_kind.kind, id);
    }
  }

  Widget _chip(String label, {required bool selected, required VoidCallback onTap, IconData? icon}) => Padding(
    padding: const EdgeInsets.only(right: 8),
    child: FilterChip(
      label: Text(label),
      avatar: icon == null ? null : Icon(icon, size: 16),
      selected: selected,
      showCheckmark: false,
      selectedColor: Wa.accent.withValues(alpha: .15),
      labelStyle: TextStyle(color: selected ? Wa.accent : Wa.text(context), fontWeight: FontWeight.w600, fontSize: 12.5),
      side: BorderSide(color: selected ? Wa.accent : Wa.border(context)),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      onSelected: (_) => onTap(),
    ),
  );

  /// Card che subtitle — list fields (title shivay) + computed.
  Widget _tile(CorpRow r) {
    final listFields = _kind.fields.where((f) => f.list).toList();
    final status = listFields.where((f) => f.type == 'select' && f.key.toLowerCase().contains('status')).firstOrNull;
    final rest = listFields.where((f) => f != status && f.key != _kind.titleField && f.type != 'textarea').take(3).toList();
    final days = _kind.computed.where((c) => c.key == 'daysLeft' || c.key == 'daysToRenewal').firstOrNull;
    final metric = _kind.computed.where((c) => c.type != 'bool' && c != days).firstOrNull;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
      child: Material(
        color: Wa.surface(context),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: BorderSide(color: Wa.border(context))),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: () => _open(_kind.kind, r.id),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: Text(r.title, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                    ),
                    if (status != null) CorpValue(field: status, row: r),
                    if (days != null && r[days.key] != null) ...[const SizedBox(width: 6), CorpValue(field: days, row: r)],
                  ],
                ),
                const SizedBox(height: 6),
                Wrap(
                  spacing: 12,
                  runSpacing: 4,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    for (final f in rest)
                      if ((r[f.key] ?? '') != '')
                        DefaultTextStyle.merge(
                          style: TextStyle(fontSize: 12.5, color: Wa.muted(context)),
                          child: f.type == 'select' ? CorpValue(field: f, row: r) : Text(corpValue(f, r[f.key], refTitle: r.ref(f.key))),
                        ),
                    if (metric != null && r[metric.key] != null)
                      Text(
                        '${metric.label}: ${corpValue(metric, r[metric.key])}',
                        style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700),
                      ),
                    if (r.files.isNotEmpty) Text('📎 ${r.files.length}', style: TextStyle(fontSize: 12.5, color: Wa.muted(context))),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final rows = _rows;
    final filterFields = _kind.fields.where((f) => f.filter).toList();
    final boolComputed = _kind.computed.where((c) => c.type == 'bool').toList();
    final totals = _totals.entries.where((e) => e.value > 0).toList();
    return Scaffold(
      floatingActionButton: _archived
          ? null
          : FloatingActionButton.extended(
              heroTag: 'corp-${_kind.kind}',
              onPressed: _add,
              backgroundColor: Wa.accent,
              foregroundColor: Wa.accentFg,
              icon: const Icon(Icons.add_rounded),
              label: Text('New ${_kind.singular.toLowerCase()}', style: const TextStyle(fontWeight: FontWeight.w700)),
            ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: CustomScrollView(
          controller: _scroll,
          physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
          slivers: [
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 4),
                child: TextField(
                  onChanged: _search,
                  decoration: const InputDecoration(hintText: 'Search…', prefixIcon: Icon(Icons.search_rounded), isDense: true),
                ),
              ),
            ),
            SliverToBoxAdapter(
              child: SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.fromLTRB(16, 8, 8, 6),
                child: Row(
                  children: [
                    for (final c in boolComputed)
                      _chip(
                        '${c.label} only',
                        selected: _filters[c.key] == 'true',
                        icon: Icons.warning_amber_rounded,
                        onTap: () {
                          setState(() => _filters[c.key] == 'true' ? _filters.remove(c.key) : _filters[c.key] = 'true');
                          _load();
                        },
                      ),
                    for (final f in filterFields)
                      _chip(
                        _filters[f.key] == null
                            ? f.label
                            : '${f.label}: ${f.type == 'ref' ? '✓' : f.type == 'bool' ? (_filters[f.key] == 'true' ? 'Yes' : 'No') : f.optionLabel(_filters[f.key])}',
                        selected: _filters[f.key] != null,
                        icon: Icons.filter_list_rounded,
                        onTap: () => _pickFilter(f),
                      ),
                    if (_kind.dateField != null)
                      _chip(
                        _range == null ? (_kind.field(_kind.dateField!)?.label ?? 'Date') : '${DateFormat('d MMM y').format(_range!.start)} – ${DateFormat('d MMM y').format(_range!.end)}',
                        selected: _range != null,
                        icon: Icons.date_range_rounded,
                        onTap: () {
                          if (_range != null) {
                            setState(() => _range = null);
                            _load();
                          } else {
                            _pickRange();
                          }
                        },
                      ),
                    _chip(
                      'Archived',
                      selected: _archived,
                      icon: Icons.archive_outlined,
                      onTap: () {
                        setState(() => _archived = !_archived);
                        _load();
                      },
                    ),
                  ],
                ),
              ),
            ),
            if (rows != null)
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(20, 4, 20, 10),
                  child: Text(
                    [
                      '$_total ${_total == 1 ? 'record' : 'records'}',
                      for (final e in totals)
                        '${_kind.field(e.key)?.label ?? e.key}: ${e.key == 'shares' ? corpNum(e.value) : corpMoney(e.value)}',
                    ].join('  ·  '),
                    style: TextStyle(fontSize: 12, color: Wa.muted(context), fontWeight: FontWeight.w600),
                  ),
                ),
              ),
            if (_error != null && rows == null)
              SliverFillRemaining(
                hasScrollBody: false,
                child: CorpError(message: _error!, onRetry: _load),
              )
            else if (rows == null)
              const SliverFillRemaining(hasScrollBody: false, child: Center(child: CircularProgressIndicator()))
            else if (rows.isEmpty)
              SliverFillRemaining(
                hasScrollBody: false,
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(32),
                    child: Text(
                      _archived ? 'No archived records' : (_q.isNotEmpty || _filters.isNotEmpty || _range != null ? 'Nothing matches these filters' : 'No ${_kind.label.toLowerCase()} yet'),
                      style: TextStyle(color: Wa.muted(context)),
                    ),
                  ),
                ),
              )
            else ...[
              SliverList.builder(itemCount: rows.length, itemBuilder: (_, i) => _tile(rows[i])),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 96),
                  child: Center(
                    child: _loadingMore
                        ? const CircularProgressIndicator()
                        : Text(rows.length >= _total ? 'End of list' : '${rows.length} of $_total', style: TextStyle(fontSize: 12, color: Wa.muted(context))),
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
