# ==============================================================================
# HelpYou-AI - Production ProGuard & R8 Optimization & Obfuscation Rules
# ==============================================================================

# 1. Capacitor Core & Plugins
-keep public class com.getcapacitor.** { *; }
-keep public class * extends com.getcapacitor.Plugin { *; }
-keep public class * extends com.getcapacitor.BridgeActivity { *; }
-keepclassmembers class * extends com.getcapacitor.Plugin {
    @com.getcapacitor.PluginMethod public *;
}
-keep public class com.helpyou.ai.** { *; }

# Keep native interface annotations and metadata
-keepattributes *Annotation*
-keepattributes JavascriptInterface
-keepattributes EnclosingMethod
-keepattributes InnerClasses
-keepattributes Signature
-keepattributes SourceFile,LineNumberTable

# 2. RevenueCat & Google Play In-App Billing
-keep class com.revenuecat.purchases.** { *; }
-keep class com.revenuecat.purchases.hybridcommon.** { *; }
-keep class com.android.billingclient.** { *; }
-dontwarn com.revenuecat.purchases.**

# 3. Google Play Services & Firebase
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# 4. Kotlin Coroutines & AndroidX
-keepclassmembernames class kotlinx.coroutines.internal.MainDispatcherFactory {
    java.lang.String FAST_SERVICE_KEY;
}
-keep class kotlinx.coroutines.android.AndroidDispatcherFactory {
    public *;
}
-dontwarn kotlinx.coroutines.**
-keep class androidx.credentials.** { *; }
-dontwarn androidx.credentials.**

# 5. OkHttp, Retrofit & Gson (Common Networking/Serialization)
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
