import 'package:flutter_test/flutter_test.dart';
import 'package:multisarv_core/data/models.dart';

ChatMessage _m({String by = 'me', DateTime? at, bool deleted = false, bool forwarded = false}) =>
    ChatMessage(id: 'm', by: by, byName: 'Me', text: 'Hello', at: at ?? DateTime.now(), deleted: deleted, forwarded: forwarded);

void main() {
  test('own fresh message can be edited', () {
    expect(_m().canEdit('me'), isTrue);
  });

  test("someone else's message cannot be edited", () {
    expect(_m(by: 'other').canEdit('me'), isFalse);
  });

  test('only within 15 minutes (same as server)', () {
    expect(_m(at: DateTime.now().subtract(const Duration(minutes: 14))).canEdit('me'), isTrue);
    expect(_m(at: DateTime.now().subtract(const Duration(minutes: 16))).canEdit('me'), isFalse);
  });

  test('deleted or forwarded messages cannot be edited', () {
    expect(_m(deleted: true).canEdit('me'), isFalse);
    expect(_m(forwarded: true).canEdit('me'), isFalse);
  });
}
