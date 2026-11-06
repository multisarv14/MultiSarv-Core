import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:share_plus/share_plus.dart';

import '../../app/locator.dart';
import '../../app/theme.dart';
import '../../core/backend.dart';
import '../../data/corporate_repository.dart';
import 'corporate_form_view.dart';
import 'corporate_widgets.dart';

/// Ek record (web `RecordDrawer`) — details, documents, jodlele records, itihas; edit / archive / restore.
/// Company Profile (singleton) la `id` = ''.
class CorporateRecordView extends StatefulWidget {
  const CorporateRecordView({super.key, required this.schema, required this.kind, required this.id, this.preset});
  final CorpSchema schema;
  final String kind;
  final String id;

  /// Singleton navin asel tar form madhe adhi bharun (Settings → Company).
  final Map<String, Object?>? preset;

  @override
  State<CorporateRecordView> createState() => _CorporateRecordViewState();
}

class _CorporateRecordViewState extends State<CorporateRecordView> {
  final _repo = locator<CorporateRepository>();
  late Future<CorpRecord> _future = _repo.get(widget.kind, widget.id);
  String? _busy;

  /// Badal zala — magchya list la refresh sathi.
  bool _changed = false;

  CorpKind get _kind => widget.schema.kind(widget.kind);

  void _reload() => setState(() => _future = _repo.get(widget.kind, widget.id));

  void _toast(String m) => ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(m)));

  Future<void> _open(String kind, String id) async {
    final changed = await Navigator.of(context).push<bool>(MaterialPageRoute(builder: (_) => CorporateRecordView(schema: widget.schema, kind: kind, id: id)));
    if (changed == true) {
      _changed = true;
      _reload();
    }
  }

  Future<void> _edit(CorpRow? row, {Map<String, Object?>? preset}) async {
    final id = await Navigator.of(
      context,
    ).push<String>(MaterialPageRoute(builder: (_) => CorporateFormView(schema: widget.schema, kind: _kind, row: row, preset: preset)));
    if (id != null) {
      _changed = true;
      _reload();
    }
  }

  Future<void> _add(CorpKind kind, String field, String id) async {
    final newId = await Navigator.of(
      context,
    ).push<String>(MaterialPageRoute(builder: (_) => CorporateFormView(schema: widget.schema, kind: kind, preset: {field: id})));
    if (newId != null) {
      _changed = true;
      _reload();
    }
  }

  Future<void> _archive(CorpRow row) async {
    final restore = row.archived;
    final reason = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(restore ? 'Restore record?' : 'Archive “${row.title}”?'),
        content: restore
            ? const Text('It will be active again.')
            : Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('Records are never deleted. It moves to Archived with its full history and files, and can be restored any time.'),
                  const SizedBox(height: 12),
                  TextField(controller: reason, decoration: const InputDecoration(hintText: 'Reason (optional)'), maxLength: 300),
                ],
              ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            style: restore ? null : FilledButton.styleFrom(backgroundColor: Theme.of(ctx).colorScheme.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(restore ? 'Restore' : 'Archive'),
          ),
        ],
      ),
    );
    final text = reason.text;
    reason.dispose();
    if (ok != true) return;
    setState(() => _busy = 'archive');
    try {
      await _repo.archive(_kind.kind, row.id, archived: !restore, reason: text);
      _changed = true;
      _toast(restore ? 'Restored' : 'Archived — history is kept');
      _reload();
    } catch (e) {
      _toast(errorText(e));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _upload(CorpRow row) async {
    final picked = await FilePicker.pickFiles();
    if (picked.isEmpty) return;
    setState(() => _busy = 'upload');
    try {
      for (final f in picked) {
        if (f.path == null) continue;
        await _repo.upload(_kind.kind, row.id, File(f.path!), f.name);
      }
      _changed = true;
      _toast('Uploaded');
      _reload();
    } catch (e) {
      _toast(errorText(e));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  /// Download (audit hoto) → phone cha share / "Open with" sheet.
  Future<void> _openFile(CorpRow row, CorpFile f) async {
    setState(() => _busy = f.id);
    try {
      final file = await _repo.download(_kind.kind, row.id, f);
      await SharePlus.instance.share(ShareParams(files: [XFile(file.path, mimeType: f.type)]));
    } catch (e) {
      _toast(errorText(e));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  Future<void> _removeFile(CorpRow row, CorpFile f) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove document?'),
        content: Text('“${f.name}” will be deleted from storage. The removal is recorded in history.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Theme.of(ctx).colorScheme.error),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _busy = f.id);
    try {
      await _repo.removeFile(_kind.kind, row.id, f.id);
      _changed = true;
      _reload();
    } catch (e) {
      _toast(errorText(e));
    } finally {
      if (mounted) setState(() => _busy = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) Navigator.of(context).pop(_changed);
      },
      child: FutureBuilder<CorpRecord>(
        future: _future,
        builder: (context, snap) {
          final rec = snap.data;
          final row = rec?.record;
          final appBar = AppBar(
            backgroundColor: Wa.bg(context),
            title: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(row?.title ?? _kind.singular, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 17)),
                Text(_kind.singular, style: TextStyle(fontSize: 12, color: Wa.muted(context))),
              ],
            ),
            actions: [
              if (row != null && !row.archived) IconButton(tooltip: 'Edit', icon: const Icon(Icons.edit_rounded), onPressed: () => _edit(row)),
              if (row != null && !_kind.singleton)
                IconButton(
                  tooltip: row.archived ? 'Restore' : 'Archive',
                  icon: _busy == 'archive'
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : Icon(row.archived ? Icons.unarchive_rounded : Icons.archive_outlined),
                  onPressed: _busy != null ? null : () => _archive(row),
                ),
            ],
          );
          if (snap.hasError) {
            return Scaffold(
              appBar: appBar,
              body: CorpError(message: errorText(snap.error!), onRetry: _reload),
            );
          }
          if (rec == null) {
            return Scaffold(
              appBar: appBar,
              body: const Center(child: CircularProgressIndicator()),
            );
          }
          if (row == null) {
            return Scaffold(
              appBar: appBar,
              body: Center(
                child: Padding(
                  padding: const EdgeInsets.all(32),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.apartment_rounded, size: 44, color: Wa.muted(context)),
                      const SizedBox(height: 12),
                      const Text('Company profile not set up', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                      const SizedBox(height: 6),
                      Text('Add CIN, PAN, GST, registered office and capital.', textAlign: TextAlign.center, style: TextStyle(color: Wa.muted(context))),
                      const SizedBox(height: 16),
                      FilledButton.icon(onPressed: () => _edit(null, preset: widget.preset), icon: const Icon(Icons.add_rounded), label: const Text('Set up')),
                    ],
                  ),
                ),
              ),
            );
          }
          final related = rec.related.fold<int>(0, (s, r) => s + r.rows.length);
          return DefaultTabController(
            length: 4,
            child: Scaffold(
              appBar: AppBar(
                backgroundColor: appBar.backgroundColor,
                title: appBar.title,
                actions: appBar.actions,
                bottom: TabBar(
                  isScrollable: true,
                  tabAlignment: TabAlignment.start,
                  labelColor: Wa.accent,
                  indicatorColor: Wa.accent,
                  unselectedLabelColor: Wa.muted(context),
                  dividerColor: Wa.border(context),
                  tabs: [
                    const Tab(text: 'Details'),
                    Tab(text: 'Documents (${row.files.length})'),
                    Tab(text: 'Linked ($related)'),
                    Tab(text: 'History (${rec.history.length})'),
                  ],
                ),
              ),
              body: TabBarView(
                children: [
                  _details(row),
                  _files(row),
                  _related(row, rec),
                  rec.history.isEmpty
                      ? Center(child: Text('No history yet', style: TextStyle(color: Wa.muted(context))))
                      : ListView.separated(
                          padding: const EdgeInsets.symmetric(vertical: 8),
                          itemCount: rec.history.length,
                          separatorBuilder: (_, _) => Divider(height: 1, indent: 56, color: Wa.border(context)),
                          itemBuilder: (_, i) => CorpHistoryTile(h: rec.history[i], schema: widget.schema),
                        ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _details(CorpRow row) {
    final short = _kind.fields.where((f) => f.type != 'textarea' && corpVisible(_kind.kind, f, row.data)).toList();
    final long = _kind.fields.where((f) => f.type == 'textarea' && (row[f.key] ?? '') != '').toList();
    final fmt = DateFormat('d MMM y, h:mm a');
    return RefreshIndicator(
      onRefresh: () async => _reload(),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        children: [
          if (row.archived)
            Container(
              margin: const EdgeInsets.only(bottom: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: const Color(0xFFF43F5E).withValues(alpha: .1), borderRadius: BorderRadius.circular(12)),
              child: Text(
                'Archived${row['archiveReason'] != null ? ' — ${row['archiveReason']}' : ''}',
                style: const TextStyle(color: Color(0xFFF43F5E), fontWeight: FontWeight.w600),
              ),
            ),
          if (_kind.computed.isNotEmpty)
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final c in _kind.computed)
                  Container(
                    width: (MediaQuery.sizeOf(context).width - 48) / 2,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: Wa.surface(context),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: Wa.border(context)),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(c.label, style: TextStyle(fontSize: 12, color: Wa.muted(context))),
                        const SizedBox(height: 4),
                        DefaultTextStyle.merge(
                          style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
                          child: CorpValue(field: c, row: row),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          const SizedBox(height: 12),
          CorpCard(
            child: Column(
              children: [
                for (var i = 0; i < short.length; i++) ...[
                  if (i > 0) Divider(height: 1, color: Wa.border(context)),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(
                          width: 130,
                          child: Text(short[i].label, style: TextStyle(color: Wa.muted(context), fontSize: 13)),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Align(
                            alignment: Alignment.centerRight,
                            child: DefaultTextStyle.merge(
                              textAlign: TextAlign.right,
                              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5),
                              child: CorpValue(field: short[i], row: row, onRef: _open),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ],
            ),
          ),
          for (final f in long) ...[
            CorpLabel(f.label),
            CorpCard(
              padding: const EdgeInsets.all(14),
              child: SelectableText('${row[f.key]}'),
            ),
          ],
          const SizedBox(height: 14),
          Text(
            'Created ${row.createdAt == null ? '—' : fmt.format(row.createdAt!)} by ${row['createdByName'] ?? '—'} · '
            'last changed ${row.updatedAt == null ? '—' : fmt.format(row.updatedAt!)} by ${row['updatedByName'] ?? '—'}',
            style: TextStyle(fontSize: 11.5, color: Wa.muted(context)),
          ),
        ],
      ),
    );
  }

  Widget _files(CorpRow row) {
    final files = row.files;
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      children: [
        Row(
          children: [
            Expanded(
              child: Text('Private — only super admins can open; every view is logged.', style: TextStyle(fontSize: 12, color: Wa.muted(context))),
            ),
            if (!row.archived)
              FilledButton.tonalIcon(
                onPressed: _busy != null ? null : () => _upload(row),
                icon: _busy == 'upload'
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.upload_file_rounded),
                label: const Text('Upload'),
              ),
          ],
        ),
        const SizedBox(height: 12),
        if (files.isEmpty)
          Padding(
            padding: const EdgeInsets.all(32),
            child: Center(child: Text('No documents attached', style: TextStyle(color: Wa.muted(context)))),
          )
        else
          CorpCard(
            child: Column(
              children: [
                for (var i = 0; i < files.length; i++) ...[
                  if (i > 0) Divider(height: 1, indent: 56, color: Wa.border(context)),
                  ListTile(
                    leading: const Icon(Icons.description_outlined, color: Wa.accent),
                    title: Text(files[i].name, maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
                    subtitle: Text(
                      '${corpFileSize(files[i].size)} · ${files[i].byName}${files[i].uploadedAt != null ? ' · ${DateFormat('d MMM y').format(files[i].uploadedAt!)}' : ''}',
                      style: TextStyle(fontSize: 12, color: Wa.muted(context)),
                    ),
                    onTap: _busy != null ? null : () => _openFile(row, files[i]),
                    trailing: _busy == files[i].id
                        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                        : row.archived
                        ? const Icon(Icons.open_in_new_rounded)
                        : IconButton(
                            tooltip: 'Remove',
                            icon: const Icon(Icons.delete_outline_rounded, color: Color(0xFFF43F5E)),
                            onPressed: _busy != null ? null : () => _removeFile(row, files[i]),
                          ),
                  ),
                ],
              ],
            ),
          ),
      ],
    );
  }

  Widget _related(CorpRow row, CorpRecord rec) {
    // Ya kind la ref karnare sagle kinds — rikame pan dakhva (tithun navin jodta yeto).
    final targets = [
      for (final k in widget.schema.kinds)
        for (final f in k.fields.where((f) => f.type == 'ref' && f.ref == _kind.kind)) (kind: k, field: f),
    ];
    if (targets.isEmpty) return Center(child: Text('Nothing linked to this record type', style: TextStyle(color: Wa.muted(context))));
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 32),
      children: [
        for (final t in targets) ...[
          CorpLabel(
            '${t.kind.label} · ${t.field.label}',
            trailing: row.archived
                ? null
                : TextButton.icon(onPressed: () => _add(t.kind, t.field.key, row.id), icon: const Icon(Icons.add_rounded, size: 18), label: const Text('Add')),
          ),
          Builder(
            builder: (context) {
              final rows = rec.related.where((r) => r.kind == t.kind.kind && r.field == t.field.key).firstOrNull?.rows ?? const <CorpRow>[];
              if (rows.isEmpty) {
                return Padding(
                  padding: const EdgeInsets.only(left: 4),
                  child: Text('None', style: TextStyle(color: Wa.muted(context))),
                );
              }
              final status = t.kind.fields.where((f) => f.key == 'status' || f.key == 'type').firstOrNull;
              return CorpCard(
                child: Column(
                  children: [
                    for (var i = 0; i < rows.length; i++) ...[
                      if (i > 0) Divider(height: 1, color: Wa.border(context)),
                      ListTile(
                        dense: true,
                        title: Text(rows[i].title, style: const TextStyle(fontWeight: FontWeight.w600)),
                        trailing: status == null ? const Icon(Icons.chevron_right_rounded) : CorpValue(field: status, row: rows[i]),
                        onTap: () => _open(t.kind.kind, rows[i].id),
                      ),
                    ],
                  ],
                ),
              );
            },
          ),
        ],
      ],
    );
  }
}
