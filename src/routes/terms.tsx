import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/agency/legal";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [
    { title: "Terms of Service — crayZmundo" },
    { name: "description", content: "The terms for using crayZmundo." },
  ] }),
  component: Terms,
});

function Terms() {
  return <LegalPage title="Terms of Service">
    <h2>What crayZmundo does</h2>
    <p>
      crayZmundo turns long videos into short vertical clips. You give it a video you own or
      have the right to use; it transcribes the audio, finds moments worth clipping, adds
      captions and a headline, renders them for a phone screen, and — if you connect an
      account — posts them for you.
    </p>

    <h2>Your content is yours</h2>
    <p>
      You keep every right you had in what you upload. You give crayZmundo permission to
      store, process and transform it only so far as is needed to produce your clips and post
      them where you ask. Nothing is published anywhere without you choosing the clip and
      confirming it.
    </p>

    <h2>What you must not upload</h2>
    <p>
      Only import video you own or are licensed to use. Do not use crayZmundo for content that
      is unlawful, that infringes someone else's copyright, or that breaks the rules of the
      platform you intend to post it to. You are responsible for what you publish under your
      own accounts, including whether a clip is a fair use of its source.
    </p>

    <h2>Connected accounts</h2>
    <p>
      Connecting TikTok, Instagram or YouTube authorises crayZmundo to post on your behalf, to
      those accounts, when you ask it to. You can disconnect an account at any time from the
      Posts screen, or revoke access from the platform itself. Disconnecting stops any further
      posting immediately; it does not delete posts already published.
    </p>

    <h2>Things that may go wrong</h2>
    <p>
      crayZmundo depends on services it does not control — the video source, transcription and
      AI providers, and the social platforms themselves. Those can be slow, change their rules,
      or refuse a request. Clips are produced by automated systems and will sometimes be cut,
      framed, captioned or titled badly. Review a clip before you post it. The service is
      provided as is, without a warranty that it will be uninterrupted or that any particular
      clip will be fit for your purpose.
    </p>

    <h2>Ending it</h2>
    <p>
      You can stop using crayZmundo and delete your material at any time. We may suspend access
      where it is being used unlawfully or in a way that puts the service or its providers at
      risk.
    </p>

    <h2>Contact</h2>
    <p>Questions about these terms: <a href="mailto:hello@crayzmundo.app">hello@crayzmundo.app</a></p>
  </LegalPage>;
}
