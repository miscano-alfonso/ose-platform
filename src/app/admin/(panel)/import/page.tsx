import { ImportForm } from "../../forms";

export default function ImportPage() {
  return <>
    <div className="top"><div><h1>Import families</h1><div className="sub">Bring families, children and their courses across from TechSaga.</div></div></div>
    <section className="card"><h2>Upload the import file</h2>
      <p className="cs">Use the families file prepared from the TechSaga payment list. Importing the same file again won’t create duplicates.
        Payments aren’t imported: they’ll come from Stripe.</p>
      <ImportForm /></section>
  </>;
}
