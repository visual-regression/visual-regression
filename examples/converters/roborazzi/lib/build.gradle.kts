plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.roborazzi)
}

android {
    namespace = "dev.visualregression.e2e"
    compileSdk = 35
    defaultConfig {
        minSdk = 24
    }
    testOptions {
        unitTests {
            isIncludeAndroidResources = true
            all {
                // -Pvariant=b recolors box-b, read by the test as a system property
                systemProperty("e2e.variant", project.findProperty("variant")?.toString() ?: "a")
            }
        }
    }
}

dependencies {
    testImplementation(libs.junit)
    testImplementation(libs.robolectric)
    testImplementation(libs.roborazzi)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.androidx.test.ext.junit)
}
