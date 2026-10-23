export default function Home() {
  return (
    <main id="main">
      <p className="eyebrow">The Joint App</p>
      <h1>A clearer view of your money, together.</h1>
      <p className="intro">
        A household finance app built around shared goals and individual
        privacy.
      </p>
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
      <footer>Built by FSS · UK first</footer>
    </main>
  );
}
