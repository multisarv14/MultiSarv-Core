import 'package:flutter_test/flutter_test.dart';
import 'package:multisarv_core/services/call_service.dart';

void main() {
  final uuid = RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$');

  test('Firestore call id becomes a valid UUID (iOS CallKit rejects anything else)', () {
    expect(callkitId('a1B2c3D4e5F6g7H8i9J0'), matches(uuid));
    expect(callkitId(''), matches(uuid));
  });

  test('same call id → same UUID (ring, end and accept must line up)', () {
    expect(callkitId('Xy7Kq0pLm3Zr8TuVw1Ns'), callkitId('Xy7Kq0pLm3Zr8TuVw1Ns'));
  });

  test('different call ids → different UUIDs', () {
    final ids = List.generate(2000, (i) => 'call${i.toString().padLeft(16, '0')}');
    expect(ids.map(callkitId).toSet().length, ids.length);
  });
}
