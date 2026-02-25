# Ordered (Final) — GitHub + Firebase + OneSignal + Cloudflare

## ✅ ما الذي في هذه النسخة؟
- نظام أدوار (admin / sales / warehouse)
- إرسال طلبات تجهيز للمخزن + سجل عمليات
- تصنيفات الطلبات داخل قائمة ☰
- ترقيم تلقائي للطلبيات (counters)
- إشعارات OneSignal (للمخزن) + إرسال إشعار عبر Cloudflare Worker (آمن بدون وضع API Key داخل GitHub)
- PWA (manifest + icons) مناسب للموبايل

## 1) رفع المشروع على GitHub
ارفع كل الملفات على جذر الريبو (بدون مجلدات).
ثم:
GitHub → Settings → Pages → Deploy from branch → main / root

## 2) Firebase
- استخدم نفس firebaseConfig الموجود في firebase.js
- ارفع قواعد Firestore من الملف: firestore.rules_FINAL.txt

## 3) OneSignal (Web Push)
- App ID: 608f0f9d-654f-4b55-946c-180d79c93a38
- OneSignal → Settings → Web Push → Web Configuration
  - Site URL = رابط GitHub Pages النهائي (مثال: https://USERNAME.github.io/REPO/)
  - احفظ

> ملفات OneSignal service worker موجودة هنا:
- OneSignalSDKWorker.js
- OneSignalSDKUpdaterWorker.js

## 4) Cloudflare Worker (إرسال الإشعار)
- خزّن Secrets في Cloudflare:
  - ONESIGNAL_API_KEY (REST API Key)
  - ONESIGNAL_APP_ID (App ID)
- رابط الـ Worker ضعه داخل config.js في:
  workerUrl

## 5) تفعيل إشعارات المخزن
افتح warehouse.html على موبايل المخزن → اضغط **تفعيل الإشعارات** ثم **Allow**.

