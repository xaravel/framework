// Illuminate\Contracts\Support\Renderable, from laravel/framework v13.37.0.
// `render` is async: every Upstream Renderable (a View, a Mailable, a MailMessage) renders a view, and a render is a
// compiled template module's `Promise<string>` (AD-11, the spine's Compilation), so `View\View`, which extends it,
// renders the same way.
import { contract } from "../Contract";

declare const RenderableBrand: unique symbol;

export interface Renderable {
  readonly [Renderable.brand]: true;

  /**
   * Get the evaluated contents of the object.
   * Renders a view (AD-11, the spine's Compilation: each compiled view module exports `render(ctx): Promise<string>`; AD-11, Views as strings: a View is never rendered by `toString()`).
   * @asyncRoot callback
   */
  render(): Promise<string>;
}

export const Renderable = contract<Renderable, typeof RenderableBrand>(
  "Illuminate\\Contracts\\Support\\Renderable",
  {
    render: [],
  },
);
