import { useContext, useState, useEffect } from "react";
import { ThemeContext } from "../../theme/ThemeContext";
import { ThemeToggle } from "../../theme/ThemeToggle";
import Browser from "webextension-polyfill";
import "./Popup.css";

export default function Popup(): JSX.Element {
  const { theme } = useContext(ThemeContext);
  const [sortOrder, setSortOrder] = useState<"dateAdded" | "dateLastViewed">(
    "dateAdded"
  );
  const [layout, setLayout] = useState<"grid" | "list">("grid");

  // Load saved preferences
  useEffect(() => {
    Browser.storage.local.get(["sortOrder", "layout"]).then((result) => {
      if (result.sortOrder)
        setSortOrder(result.sortOrder as "dateAdded" | "dateLastViewed");
      if (result.layout) setLayout(result.layout as "grid" | "list");
    });
  }, []);

  // Save preferences when changed
  useEffect(() => {
    Browser.storage.local.set({ sortOrder, layout });
  }, [sortOrder, layout]);

  return (
    <div className="popup-container">
      <header className="popup-header">
        <h1>Safari Reading List</h1>
        <a
          href="https://github.com/wtf403/safari-reading-list"
          target="_blank"
          rel="noopener noreferrer"
          className="github-link"
        >
          <img
            width={8}
            height={8}
            src="https://github.com/fluidicon.png"
            alt="GitHub"
          />
          <span>GitHub</span>
        </a>
        <p>v0.0.1</p>
      </header>

      <div className="popup-content">
        <section className="control-section">
          <h2>Display Settings</h2>

          <div className="control-group">
            <label>
              <span>Sort by</span>
              <select
                value={sortOrder}
                onChange={(e) =>
                  setSortOrder(e.target.value as "dateAdded" | "dateLastViewed")
                }
              >
                <option value="dateAdded">Date Added</option>
                <option value="dateLastViewed">Last Visited</option>
              </select>
            </label>
          </div>

          <div className="control-group">
            <label>
              <span>Layout</span>
              <select
                value={layout}
                onChange={(e) => setLayout(e.target.value as "grid" | "list")}
              >
                <option value="grid">Grid View</option>
                <option value="list">List View</option>
              </select>
            </label>
          </div>
        </section>

        <section className="control-section">
          <h2>Theme</h2>
          <div className="theme-control">
            <ThemeToggle />
          </div>
        </section>
      </div>
    </div>
  );
}
