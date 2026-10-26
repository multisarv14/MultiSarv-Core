import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/intl.dart';
import 'package:multisarv_core/data/models.dart';
import 'package:multisarv_core/features/conversation/widgets/bubble.dart';

final _at = DateTime(2026, 10, 26, 9, 41);

Future<void> _pump(WidgetTester t, String text, {double width = 360}) => t.pumpWidget(
  MaterialApp(
    home: Scaffold(
      body: Center(
        child: SizedBox(
          width: width,
          child: Bubble(
            m: ChatMessage(id: 'm1', by: 'u1', byName: 'Amit', text: text, at: _at),
            me: 'u2',
            mine: false,
            first: true,
            highlight: false,
            onReply: () {},
            onJump: (_) {},
            onDelete: (_) {},
          ),
        ),
      ),
    ),
  ),
);

/// Disnari vel (ghost `Opacity` madhli nahi).
Rect _stamp(WidgetTester t) {
  final all = find.text(DateFormat.jm().format(_at));
  final visible = all.evaluate().where((e) => e.findAncestorWidgetOfExactType<Opacity>() == null).single;
  final box = visible.renderObject! as RenderBox;
  return box.localToGlobal(Offset.zero) & box.size;
}

Rect _message(WidgetTester t, String text) => t.getRect(find.byWidgetPredicate((w) => w is RichText && w.text.toPlainText().startsWith(text)));

void main() {
  testWidgets('short message: time sits on the same line as the text', (t) async {
    await _pump(t, 'Hi');
    final msg = _message(t, 'Hi'), stamp = _stamp(t);
    expect(msg.height, lessThan(30)); // ekach ol
    expect(stamp.left, greaterThan(msg.left + 10)); // text chya ujvikade, khali nahi
    expect(stamp.bottom, lessThanOrEqualTo(msg.bottom + 1));
  });

  testWidgets('long message whose last line has room: no extra line for the time', (t) async {
    const text = 'This is a fairly long message that will definitely wrap onto more than one line here ok';
    await _pump(t, text);
    final msg = _message(t, text), stamp = _stamp(t);
    // Vel text chya shevatchya olit — khali vegli ol nahi.
    expect(stamp.bottom, lessThanOrEqualTo(msg.bottom + 1));
    expect(stamp.top, greaterThan(msg.bottom - 22));
  });

  testWidgets('text that fills the line: time moves to the bottom-right', (t) async {
    const text = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    await _pump(t, text, width: 300);
    final msg = _message(t, text), stamp = _stamp(t);
    expect(stamp.bottom, lessThanOrEqualTo(msg.bottom + 1));
    expect(stamp.right, closeTo(msg.right, 1)); // ujvikade
  });
}
