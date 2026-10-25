import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/agency/legal";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [
    { title: "Privacy Policy — crayZmundo" },
    { name: "description", content: "What crayZmundo stores, who else sees it, and how to remove it." },
  ] }),
  component: Privacy,
});

function Privacy() {
  return <LegalPage title="Privacy Policy">
    <p>
      This describes what crayZmundo actually does with your data. It is written against how
      the software works rather than in general terms.
    </p>

    <h2>What is stored</h2>
    <ul>
      <li><strong>Your account</strong> — the email address you sign in with.</li>
      <li><strong>Your videos and clips</strong> — the source video you import and every clip
        rendered from it, held so you can edit and re-export them.</li>
      <li><strong>Transcripts</strong> — the words spoken in your video, with their timings,
        used for captions and for finding moments.</li>
      <li><strong>Your settings</strong> — caption styles, handle, and how you have asked the
        AI to write headlines and descriptions.</li>
      <li><strong>Connected accounts</strong> — for each social account you connect, an access
        token, a refresh token and the account's identifier and display name. Tokens are held
        so clips can be posted on your behalf, and for nothing else.</li>
    </ul>

    <h2>Who else sees it</h2>
    <ul>
      <li><strong>Supabase</strong> — hosts the database and stores your videos and clips.</li>
      <li><strong>Groq</strong> — receives the audio of your video to transcribe it.</li>
      <li><strong>Cheaper Inference</strong> — receives the transcript text to choose moments
        and write headlines and captions. It does not receive the video.</li>
      <li><strong>Fly.io</strong> — runs the rendering engine that cuts and frames your clips.</li>
      <li><strong>TikTok, Meta and Google</strong> — receive a clip and its caption only when
        you post to them, and only for the account you connected.</li>
    </ul>
    <p>
      Your material is not sold, and it is not used to train anyone's models by us. What those
      providers do under their own terms is set out in their policies.
    </p>

    <h2>What is not collected</h2>
    <p>
      There is no advertising, no third-party analytics or tracking pixels, and no attempt to
      profile you. Nothing is read from the social accounts you connect beyond the identity of
      the account itself — not your followers, your messages, or your existing posts.
    </p>

    <h2>Social account tokens</h2>
    <p>
      Tokens are stored server-side and are never exposed to the browser. They are used only to
      publish the clips you confirm. Disconnecting an account on the Posts screen deletes its
      tokens; you can also revoke access from TikTok, Instagram or Google directly, which stops
      posting at once.
    </p>

    <h2>Keeping and deleting</h2>
    <p>
      Videos, clips and transcripts are kept until you delete them, so that you can come back to
      a clip later. Deleting a video removes its clips and its transcript. Deleting your account
      removes everything held for you, including tokens. Ask at the address below and it will be
      done.
    </p>

    <h2>Where it is held</h2>
    <p>
      Data is held on servers operated by the providers listed above, which process data outside
      Australia, including in the United States and the European Union.
    </p>

    <h2>Contact</h2>
    <p>
      Questions, or a request to see or delete what is held about you:{" "}
      <a href="mailto:hello@crayzmundo.app">hello@crayzmundo.app</a>
    </p>
  </LegalPage>;
}
