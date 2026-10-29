import 'package:flutter_test/flutter_test.dart';
import 'package:multisarv_core/data/chat_repository.dart';

void main() {
  const apk = 'application/vnd.android.package-archive';

  test('APK files are allowed in chat', () {
    expect(chatContentType('MultiSarv-release.apk'), apk);
    expect(chatContentType('APP.APK'), apk);
  });

  test('APK gets 100 MB, video 50 MB, the rest 10 MB (same as storage.rules)', () {
    expect(chatMaxFor(apk), 100 * 1024 * 1024);
    expect(chatMaxFor('video/mp4'), 50 * 1024 * 1024);
    expect(chatMaxFor('application/pdf'), 10 * 1024 * 1024);
  });

  test('other executables stay blocked', () {
    expect(chatContentType('setup.exe'), isNull);
    expect(chatContentType('script.sh'), isNull);
  });
}
