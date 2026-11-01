# AstralisDesk — karar ve geliştirme kaydı

Son güncelleme: 2026-11-01. Bu dosya sonraki çalışmaların başlangıç noktasıdır.

## Asıl hedef ve öncelik

Kullanıcının birinci hedefi minimum gerçekleşmiş maliyetle maksimum gerçek işlem hacmi. QFEX öncelikli, tek hesapta aç-kapat; bekleme opsiyonel ve varsayılan kapalı. İlk talep FundingDesk benzeri hedge ekranıydı; kullanıcı bunu tek borsada volume stratejisine çevirdi. İki subaccount ile hedge ilk sürüm hedefi DEĞİL. Kendi emirlerini karşılaştıran yapay hacim mekanizması kurulmayacak.

Yeni grafik, borsa listesi ve tasarım yerine ilk tamamlanacak iş gerçek emir yaşam döngüsü. Mevcut aday takibi emir yürütme değildir. Minimum maliyet garanti edilemez; gerçekleşmiş ücret, spread, kayma ve fiyat PnL'si ölçülmelidir. Funding tek başına fiyat yönü sinyali değildir. Hemen kapatılan işlemde funding geliri varsayılmaz. Market making sürekli çift taraflı kotasyon ve envanter yönetimidir; sırayla aç-kapat bundan farklıdır.

## Kullanıcı kararları

- Demo veya sahte piyasa verisi yok. Test fixture'ları üretime taşınmaz.
- Süre 1 dk, sıklık 30 sn, döngü arası 1 dk, opsiyonel bekleme 30 dk. Bekleme kapalı. Daha hızlı yürütme ancak borsa sınırları ve gerçek maliyetle değerlendirilecek.
- Uygun aday risk/maliyet sınırından çıkarsa yeni açılışları durdur; mevcut emir ve pozisyonu çözdükten sonra yeni adaya geç.
- QFEX korunsun, kripto için ek borsa olsun. Hyperliquid şu anda yalnızca veri ekranı.
- GitHub düzenli commit; Vercel manuel deploy. GitHub otomatik Vercel bağlantısı istenmiyor.
- VPS'teki diğer projelere kesinlikle dokunma. Yalnızca AstralisDesk servisini değiştir.
- Anahtar/parola/oturum tokenı bu dosyaya, Git'e veya loglara yazılmaz.

## Tamamlananlar ve sınırları

- QFEX REST katalog + public MDS WebSocket: derinlik/funding/statistik, veri yaşı kontrolleri. Son doğrulamada 333 katalog marketi, 236 REST sözleşmesi; canlı sayı değişebilir.
- Mevcut QFEX katalog incelemesinde BTC/ETH/SOL perp yoktu; başka borsa verisi QFEX fiyatı gibi kullanılamaz.
- Gerçek hesap ücretleriyle taker maliyet hesabı, limit kontrolleri, kalıcı aday takibi. Maker yürütme henüz yok.
- Yerelde Windows DPAPI; toplulukta kullanıcı oturumuna bağlı şifreli kasa. Kalıcı kullanıcı girişi/kurtarma henüz yok; gizli pencere/yeni tarayıcı ayrı oturum.
- Vercel arayüz ve proxy; VPS /opt/astralisdesk altında ayrı Docker servisi, 8443 portu. Başka uygulamalar 80/443 kullanıyor.
- Hyperliquid public/crypto.js: resmî metaAndAssetCtxs ile 15 saniyede fiyat/funding/hacim. Görüntüleme amaçlı; görev/maliyet/emir entegrasyonu yok.
- CCXT pasif public adaptör; Hummingbot sadece kaynak referansı. perp-cli README incelendi, QFEX dahil adaptörleri karşılaştırma adayı. Kaynak kodu ve güvenliği henüz doğrulanmadı; bağımlılık eklenmedi.

## Tarihçe ve hatalar

1. FundingDesk ekranları referans alındı; ilk iki-bacak arayüzü kullanıcı hedefini yanlış yansıttı. Tek hesap volume akışına geçildi.
2. API formu yenilenip alanları kaybediyordu; hata görünürlüğü ve alan koruma düzeltildi.
3. Ücretler bilinmeden sıfır varsayılmadı; Explorer uyarısı veri akışı arızası sanıldı. Public veri ile kişisel komisyon durumu ayrıldı.
4. QFEX /user/positions HTTP 500 verdi. Ücret kimlik doğrulaması başarılı; /user/subaccounts/balance yedeği bakiyeyi okuyabildi. Pozisyonlar bilinmiyor durumunda tutuldu. Boş bakiye HTTP 500'ün kanıtlanmış nedeni değil.
5. Üretim deploy sonrası proxy secret env değişimi restart ile uygulanmadı; yalnız AstralisDesk container yeniden oluşturuldu ve gateway düzeldi. Geçici açığa çıkan geçit anahtarı değiştirildi; değerler kayda alınmaz.
6. Windows testlerinde kısıtlı geçici dizinde rename EPERM görüldü; izinli test çalıştırmasında 19/19 geçti. Kanıt olmadan dosya kilidi kaynaklı denmemeli.
7. Vercel deploy bir kez Not authorized verdi; sonraki whoami khenzarr doğrulaması ve deploy başarılı oldu. Kullanıcıya yeniden giriş zorunlu denmeden mevcut oturum kontrol edilmeli.
8. aa279f0: Hyperliquid görüntüleme ve uyarı açıklaması. Canlı yayın READY, ana sayfa/crypto.js HTTP200, backend sağlık başarılı. Gerçek emir modu hâlâ unavailable.

## Önce tamamlanacak yürütme işi

1. QFEX özel Trade WebSocket auth + başlangıç pozisyon/bakiye/açık emir snapshot'ları. REST 500'e rağmen eksiksiz WS snapshot kanıtlanırsa alternatif olabilir; boş varsayma.
2. Belgelenmiş limit/post-only, reduce-only ve cancel komutları; tick/lot, min miktar, serbest teminat, gerçek kaldıraç kontrolleri.
3. Kalıcı client order ID, gönderim öncesi journal; belirsiz timeout'ta aynı emri körlemesine tekrar gönderme. Kısmi fill ve iptal yarışlarını mutabakatla çöz.
4. Açılış maker tercihi; dolmayan emir için süre/yeniden fiyatlama sınırı. Kapanış yalnız gerçekleşen miktar kadar reduce-only. Maker dolumu garanti sayılmaz; acil çıkış maliyeti ayrıca sınırlanır.
5. Gerçek ücret/PnL/hacim muhasebesi, günlük zarar ve maliyet bütçesi, yeni açılışı durdurma, bekleyen emir iptali, pozisyon kapatma ve yeniden başlama mutabakatı.
6. Bağlantı kopması, kısmi fill, timeout, çift yanıt, restart ve riskli aday değişimi testleri. Kullanıcı hesabında en küçük gerçek işlem için miktar/bütçe netleştirilip açık onay alınır.

## Ertelenen ve başlanmamış işler

- Funding history ve funding delta grafikleri, market detay sayfası, Position Controls.
- Hyperliquid hesap/ücret/derinlik ve gerçek işlem adaptörü; diğer borsaların entegrasyonu.
- İki borsalı delta-neutral/funding arbitrajı.
- Topluluk kalıcı kimlik doğrulama, oturum kurtarma ve operasyonel kullanıcı kotaları.
- Maker stratejisi performans ölçümü ve parametre optimizasyonu.

Bu başlıklar bitmiş sayılmaz. Yeni geliştirme sonunda gerçekleşen değişikliği ve doğrulamasını buraya işle.
