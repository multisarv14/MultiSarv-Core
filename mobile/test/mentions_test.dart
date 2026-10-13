import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:multisarv_core/features/conversation/widgets/mentions.dart';

TextEditingValue _at(String text) => TextEditingValue(text: text, selection: TextSelection.collapsed(offset: text.length));

void main() {
  const members = [MentionMember('ua', 'Amit Patil'), MentionMember('ur', 'Ramdas'), MentionMember('uk', 'Kiran Amte')];

  test('typing @ opens the list (empty query)', () {
    expect(mentionQuery(_at('Hello @')), (start: 6, query: ''));
    expect(mentionMatches(members, '').length, 3);
  });

  test('query filters by any word of the name', () {
    expect(mentionQuery(_at('ok @am'))?.query, 'am');
    expect(mentionMatches(members, 'am').map((m) => m.uid), ['ua', 'uk']); // Amit, Amte
    expect(mentionMatches(members, 'pat').map((m) => m.uid), ['ua']);
  });

  test('no list for emails or mid-word @', () {
    expect(mentionQuery(_at('mail a@b')), isNull);
    expect(mentionQuery(_at('no mention here')), isNull);
  });

  test('multiple mentions are collected, only real members', () {
    final ids = mentionsIn('@Amit Patil please check, @Ramdas too. @Nobody', members);
    expect(ids, ['ua', 'ur']);
  });

  test('highlight spans split mention tags', () {
    final spans = mentionSpans('Hi @Ramdas and @Amit Patil!', ['Ramdas', 'Amit Patil'], highlight: const TextStyle(fontWeight: FontWeight.bold));
    final texts = spans.map((s) => (s as TextSpan).text).toList();
    expect(texts, ['Hi ', '@Ramdas', ' and ', '@Amit Patil', '!']);
    expect((spans[1] as TextSpan).style?.fontWeight, FontWeight.bold);
  });
}
