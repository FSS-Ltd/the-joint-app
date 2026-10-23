import { IdentityFrame } from "../components/identity/frame";

export default function Home() {
  return (
    <IdentityFrame
      eyebrow="The Family Fund App"
      title="A clearer view of your money, together."
      description="A household finance app built around shared goals and individual privacy."
    >
      <section
        className="surface form-card"
        aria-labelledby="development-title"
      >
        <h2 id="development-title">A little clearer, together.</h2>
        <p className="status">In development</p>
        <p>
          We are laying the foundations. Account tracking, budgets and shared
          goals will arrive in future releases.
        </p>
        <a href="https://github.com/FSS-Ltd/the-joint-app">
          Follow development on GitHub <span aria-hidden="true">↗</span>
        </a>
        <p>
          <a href="/sign-in">
            Sign in to your household <span aria-hidden="true">↗</span>
          </a>
        </p>
      </section>
    </IdentityFrame>
  );
}
