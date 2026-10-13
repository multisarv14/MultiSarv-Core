import 'package:flutter/material.dart';

/// Group `@mention` — web `Composer` / `MessageText` sarkhe: text madhe `@Naav`, server la uid.

class MentionMember {
  const MentionMember(this.uid, this.name);
  final String uid;
  final String name;
}

/// Cursor chya mage `@…` (shabdachya survatila) — suggestion list.
final _mentionAt = RegExp(r'(?:^|\s)@([^\s@]{0,30})$');

/// Cursor paryant `@query` asel tar {start (`@` chi jaga), query}.
({int start, String query})? mentionQuery(TextEditingValue v) {
  final caret = v.selection.baseOffset;
  if (caret < 0 || caret > v.text.length) return null;
  final m = _mentionAt.firstMatch(v.text.substring(0, caret));
  if (m == null) return null;
  final q = m.group(1)!;
  return (start: caret - q.length - 1, query: q);
}

/// Naav madhla konatahi shabd query ne suru hoto (WhatsApp sarkha).
List<MentionMember> mentionMatches(List<MentionMember> all, String query, {int max = 6}) {
  final q = query.toLowerCase();
  return all.where((m) => m.name.toLowerCase().split(RegExp(r'\s+')).any((w) => w.startsWith(q))).take(max).toList();
}

/// Text madhe `@Naav` asnare members (pathavtana) — anek mention chalto.
List<String> mentionsIn(String text, List<MentionMember> members) =>
    members.where((m) => m.name.isNotEmpty && text.contains('@${m.name}')).map((m) => m.uid).toSet().toList();

/// `@Naav` tukde highlight karun spans. `tags` = mention kelelyanche naav.
List<InlineSpan> mentionSpans(String text, Iterable<String> names, {required TextStyle highlight}) {
  final tags = names.where((n) => n.isNotEmpty).map((n) => '@$n').toSet().toList()..sort((a, b) => b.length.compareTo(a.length));
  if (tags.isEmpty) return [TextSpan(text: text)];
  final out = <InlineSpan>[];
  var rest = text;
  while (rest.isNotEmpty) {
    var at = -1;
    var tag = '';
    for (final t in tags) {
      final i = rest.indexOf(t);
      if (i >= 0 && (at < 0 || i < at)) {
        at = i;
        tag = t;
      }
    }
    if (at < 0) {
      out.add(TextSpan(text: rest));
      break;
    }
    if (at > 0) out.add(TextSpan(text: rest.substring(0, at)));
    out.add(TextSpan(text: tag, style: highlight));
    rest = rest.substring(at + tag.length);
  }
  return out;
}

/// Input madhech `@Naav` rangit (WhatsApp sarkha) — fakt group members che naav.
class MentionController extends TextEditingController {
  List<MentionMember> members = const [];
  Color color = Colors.blue;

  @override
  TextSpan buildTextSpan({required BuildContext context, TextStyle? style, required bool withComposing}) {
    if (members.isEmpty || !text.contains('@')) return super.buildTextSpan(context: context, style: style, withComposing: withComposing);
    final names = members.map((m) => m.name).where((n) => text.contains('@$n'));
    return TextSpan(
      style: style,
      children: mentionSpans(text, names, highlight: TextStyle(color: color, fontWeight: FontWeight.w600)),
    );
  }
}
