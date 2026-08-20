const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // AI GENERATION API
    if (url.pathname === "/api/generate") {
      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers: corsHeaders,
        });
      }

      if (request.method !== "POST") {
        return json(
          { error: "Method not allowed" },
          405
        );
      }

      try {
        if (!env.OPE) {
          return json(
            { error: "OPE is not configured." },
            500
          );
        }

        const body = await request.json();

        const image = body.image;
        const modification =
          body.modification || "S3 Front Bumper";

        if (!image) {
          return json(
            { error: "No image provided." },
            400
          );
        }

        const match = image.match(
          /^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/
        );

        if (!match) {
          return json(
            {
              error:
                "Image must be PNG, JPEG or WebP.",
            },
            400
          );
        }

        const mimeType =
          match[1] === "image/jpg"
            ? "image/jpeg"
            : match[1];

        const base64Data = match[2];

        const binary = Uint8Array.from(
          atob(base64Data),
          c => c.charCodeAt(0)
        );

        const form = new FormData();

        form.append("model", "gpt-image-1");

        form.append(
          "prompt",
          `Edit the uploaded car photo realistically.

Keep the exact same Audi A3 8P Sportback.

Keep:
- the exact body proportions
- original paint color
- original wheels
- original headlights
- original background
- original camera angle
- original lighting

ONLY apply this modification:

${modification}

Make the modification look like a real OEM-quality installation on the original car.

Do not redesign the car.
Do not change the wheels.
Do not change the paint.
Do not change the background.
Do not change the camera angle.
Do not add other modifications.

Photorealistic automotive photography.`
        );

        form.append(
          "image",
          new Blob([binary], { type: mimeType }),
          "car.jpg"
        );

        form.append("n", "1");
        form.append("size", "auto");
        form.append("quality", "auto");
        form.append("output_format", "jpeg");

        const response = await fetch(
          "https://api.openai.com/v1/images/edits",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.OPE}`,
            },
            body: form,
          }
        );

        const result = await response.json();

        if (!response.ok) {
          console.error("OpenAI error:", result);

          return json(
            {
              error:
                result?.error?.message ||
                "OpenAI image generation failed.",
            },
            response.status
          );
        }

        const generated =
          result?.data?.[0]?.b64_json;

        if (!generated) {
          return json(
            {
              error:
                "OpenAI returned no generated image.",
            },
            500
          );
        }

        return json({
          image:
            "data:image/jpeg;base64," +
            generated,
        });
      } catch (error) {
        console.error(
          "CarForge generation error:",
          error
        );

        return json(
          {
            error:
              error?.message ||
              "Generation failed.",
          },
          500
        );
      }
    }

    // WEBSITE
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response("CarForge", {
      status: 200,
    });
  },
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
