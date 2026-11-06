import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../app/theme.dart';
import '../../data/corporate_repository.dart';

/// Section → icon (web `masterNav.ts` sarkhe).
const corpSectionIcons = <String, IconData>{
  'company': Icons.apartment_rounded,
  'directors': Icons.manage_accounts_rounded,
  'shareholders': Icons.pie_chart_rounded,
  'capital': Icons.account_balance_rounded,
  'investors': Icons.handshake_rounded,
  'documents': Icons.folder_special_rounded,
  'meetings': Icons.gavel_rounded,
  'compliance': Icons.event_available_rounded,
  'assets': Icons.copyright_rounded,
  'relatedParties': Icons.hub_rounded,
};

class CorpBadge extends StatelessWidget {
  const CorpBadge(this.label, {super.key, this.color});
  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ?? Wa.muted(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(color: c.withValues(alpha: .13), borderRadius: BorderRadius.circular(20)),
      child: Text(
        label,
        style: TextStyle(color: c, fontWeight: FontWeight.w700, fontSize: 11.5),
      ),
    );
  }
}

/// Compliance / renewal — kiti divas urle (lal = ushir).
class CorpDaysBadge extends StatelessWidget {
  const CorpDaysBadge(this.days, {super.key});
  final int days;

  @override
  Widget build(BuildContext context) {
    if (days < 0) return CorpBadge('${-days}d late', color: const Color(0xFFF43F5E));
    if (days == 0) return const CorpBadge('Today', color: Color(0xFFF43F5E));
    return CorpBadge('${days}d left', color: days <= 7 ? const Color(0xFFF59E0B) : (days <= 30 ? const Color(0xFF0EA5E9) : null));
  }
}

/// Field value — select la rang, ref tap kela ki to record.
class CorpValue extends StatelessWidget {
  const CorpValue({super.key, required this.field, required this.row, this.onRef, this.full = false});
  final CorpField field;
  final CorpRow row;
  final void Function(String kind, String id)? onRef;
  final bool full;

  @override
  Widget build(BuildContext context) {
    final v = row[field.key];
    if (v == null || v == '') return Text('—', style: TextStyle(color: Wa.muted(context)));
    if (field.key == 'overdue') return v == true ? const CorpBadge('Overdue', color: Color(0xFFF43F5E)) : const Text('—');
    if ((field.key == 'daysLeft' || field.key == 'daysToRenewal') && v is num) {
      if (row['status'] != null && row['dueDate'] != null && row['status'] != 'pending') return const Text('—');
      return CorpDaysBadge(v.toInt());
    }
    switch (field.type) {
      case 'select':
        return CorpBadge(field.optionLabel(v), color: field.key.toLowerCase().contains('status') ? corpTone(v) : null);
      case 'bool':
        return CorpBadge(v == true ? 'Yes' : 'No', color: v == true ? const Color(0xFF10B981) : null);
      case 'ref':
        final title = row.ref(field.key) ?? '$v';
        if (onRef == null || field.ref == null) return Text(title);
        return InkWell(
          onTap: () => onRef!(field.ref!, '$v'),
          child: Text(
            title,
            style: const TextStyle(color: Wa.accent, fontWeight: FontWeight.w600),
          ),
        );
    }
    return Text(
      corpValue(field, v),
      maxLines: full ? null : 3,
      overflow: full ? null : TextOverflow.ellipsis,
      style: TextStyle(fontFeatures: field.isNumber ? const [FontFeature.tabularFigures()] : null, fontFamily: field.pattern != null ? 'monospace' : null),
    );
  }
}

/// Itihas — kon, kay, kevha, field juna → navin.
class CorpHistoryTile extends StatelessWidget {
  const CorpHistoryTile({super.key, required this.h, required this.schema, this.showRecord = false, this.onOpen});
  final CorpHistory h;
  final CorpSchema schema;
  final bool showRecord;
  final VoidCallback? onOpen;

  static const _icons = {
    'create': (Icons.add_circle_rounded, Color(0xFF10B981)),
    'update': (Icons.edit_rounded, Color(0xFF0EA5E9)),
    'archive': (Icons.archive_rounded, Color(0xFFF43F5E)),
    'restore': (Icons.unarchive_rounded, Color(0xFF8B5CF6)),
    'fileAdd': (Icons.upload_file_rounded, Color(0xFF10B981)),
    'fileRemove': (Icons.delete_rounded, Color(0xFFF43F5E)),
    'fileView': (Icons.visibility_rounded, Color(0xFF94A3B8)),
  };

  @override
  Widget build(BuildContext context) {
    final icon = _icons[h.action] ?? _icons['update']!;
    final def = schema.kinds.where((k) => k.kind == h.kind).firstOrNull;
    final when = h.at == null ? '' : DateFormat('d MMM y, h:mm a').format(h.at!);
    return InkWell(
      onTap: onOpen,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            CircleAvatar(radius: 14, backgroundColor: icon.$2.withValues(alpha: .14), child: Icon(icon.$1, size: 16, color: icon.$2)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text.rich(
                    TextSpan(
                      children: [
                        TextSpan(
                          text: h.byName,
                          style: const TextStyle(fontWeight: FontWeight.w700),
                        ),
                        TextSpan(text: ' ${h.actionLabel}'),
                        if (showRecord) ...[
                          TextSpan(text: ' · ${def?.singular ?? h.kind} '),
                          TextSpan(
                            text: h.recordTitle,
                            style: const TextStyle(color: Wa.accent, fontWeight: FontWeight.w600),
                          ),
                        ],
                      ],
                    ),
                    style: TextStyle(fontSize: 13.5, color: Wa.text(context)),
                  ),
                  const SizedBox(height: 2),
                  Text(when, style: TextStyle(fontSize: 11.5, color: Wa.muted(context))),
                  if (h.fileName != null) Text('📎 ${h.fileName}', style: TextStyle(fontSize: 12, color: Wa.muted(context))),
                  if (h.reason != null && h.reason!.isNotEmpty)
                    Text(
                      h.reason == 'recurrence' ? 'Created automatically after the previous one was filed' : '“${h.reason}”',
                      style: TextStyle(fontSize: 12, color: Wa.muted(context)),
                    ),
                  if (def != null && h.changes.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    for (final c in h.changes.take(12))
                      if (def.field(c.field) case final f?)
                        Padding(
                          padding: const EdgeInsets.only(bottom: 3),
                          child: Text.rich(
                            TextSpan(
                              children: [
                                TextSpan(
                                  text: '${f.label}: ',
                                  style: const TextStyle(fontWeight: FontWeight.w600),
                                ),
                                if (h.action == 'update')
                                  TextSpan(
                                    text: '${_short(corpValue(f, c.from)).ifEmpty('—')}  →  ',
                                    style: TextStyle(color: Wa.muted(context), decoration: TextDecoration.lineThrough),
                                  ),
                                TextSpan(text: _short(corpValue(f, c.to)).ifEmpty('—')),
                              ],
                            ),
                            style: TextStyle(fontSize: 12, color: Wa.text(context)),
                          ),
                        ),
                    if (h.changes.length > 12) Text('+${h.changes.length - 12} more', style: TextStyle(fontSize: 12, color: Wa.muted(context))),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _short(String s) => s.length > 160 ? '${s.substring(0, 160)}…' : s;
}

extension on String {
  String ifEmpty(String other) => isEmpty ? other : this;
}

class CorpError extends StatelessWidget {
  const CorpError({super.key, required this.message, required this.onRetry});
  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) => Center(
    child: Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.cloud_off_rounded, size: 40, color: Wa.muted(context)),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center, style: TextStyle(color: Wa.muted(context))),
          const SizedBox(height: 16),
          FilledButton.icon(onPressed: onRetry, icon: const Icon(Icons.refresh_rounded), label: const Text('Retry')),
        ],
      ),
    ),
  );
}

/// Group card (profile sarkha) — rounded border.
class CorpCard extends StatelessWidget {
  const CorpCard({super.key, required this.child, this.padding = EdgeInsets.zero});
  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) => Container(
    padding: padding,
    decoration: BoxDecoration(
      color: Wa.surface(context),
      borderRadius: BorderRadius.circular(16),
      border: Border.all(color: Wa.border(context)),
    ),
    clipBehavior: Clip.antiAlias,
    child: child,
  );
}

class CorpLabel extends StatelessWidget {
  const CorpLabel(this.text, {super.key, this.trailing});
  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(4, 20, 4, 8),
    child: Row(
      children: [
        Expanded(
          child: Text(
            text.toUpperCase(),
            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: .6, color: Wa.muted(context)),
          ),
        ),
        ?trailing,
      ],
    ),
  );
}
