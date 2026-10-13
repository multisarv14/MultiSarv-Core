import 'package:firebase_core/firebase_core.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:multisarv_core/core/backend.dart';

void main() {
  FirebaseException fx(String code) => FirebaseException(plugin: 'cloud_firestore', code: code, message: 'raw $code');

  test('permission errors explain Module Access instead of a raw message', () {
    expect(errorText(fx('permission-denied')), contains('Module Access'));
  });
  test('offline / unreachable server gives a retry hint', () {
    expect(errorText(fx('unavailable')), contains('connection'));
  });
  test('server error keys map to friendly text', () {
    expect(errorText(AppError('Custom')), 'Custom');
    expect(errorText('core.err.ticketDenied'), "You don't have permission for this ticket action.");
  });
  test('unknown Firebase codes fall back to the server message', () {
    expect(errorText(fx('internal')), 'raw internal');
  });
}
