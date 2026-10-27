package dev.visualregression.e2e

import android.graphics.Color
import android.view.View
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Three solid views, like the boxes of the shared page; `e2e.variant=b` recolors box-b. */
@RunWith(AndroidJUnit4::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [35])
class BoxTest {
    @Test
    fun boxes() {
        val variant = System.getProperty("e2e.variant") ?: "a"
        val colors = linkedMapOf(
            "a" to "#1f6feb",
            "b" to if (variant == "b") "#bf8700" else "#2da44e",
            "c" to "#cf222e",
        )
        for ((box, color) in colors) {
            val view = View(ApplicationProvider.getApplicationContext())
            view.setBackgroundColor(Color.parseColor(color))
            view.measure(
                View.MeasureSpec.makeMeasureSpec(80, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(120, View.MeasureSpec.EXACTLY),
            )
            view.layout(0, 0, 80, 120)
            view.captureRoboImage("build/outputs/roborazzi/box-$box.png")
        }
    }
}
