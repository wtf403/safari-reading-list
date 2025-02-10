import { useEffect, useState, useContext, useCallback } from "react";
import "@pages/newtab/Newtab.css";
import Browser from "webextension-polyfill";
import { Theme, ThemeContext } from "../../theme/ThemeContext";

type ReadingListItem = {
  Title: string;
  Children: {
    URLString: string; // URL of the item
    URIDictionary?: {
      title?: string; // Title of the item
    };
    ReadingList?: {
      DateAdded?: string; // When the item was added
      DateLastViewed?: string; // When the item was last viewed
      PreviewText?: string; // Preview text
    };
    ReadingListNonSync?: {
      DateLastFetched?: string; // When the item was last fetched
      PreviewText?: string; // Preview text
      Title?: string; // Title of the item
      siteName?: string; // Site name
    };
  }[];
};

type ReadingListItemType = {
  url: string;
  title: string;
  dateAdded?: string;
  dateLastViewed?: string;
  previewText?: string;
  siteName?: string;
  dateLastFetched?: string;
};

async function getReadingList() {
  try {
    const response: { success: boolean; error: string; data: unknown } =
      await Browser.runtime.sendNativeMessage(
        "com.wtf403.safari_reading_list",
        {
          command: "getBookmarks",
        }
      );

    if (!response.success) {
      throw new Error(response.error);
    }

    console.log(response.data);

    const parsedPlist = response.data as {
      Children: ReadingListItem[];
    };

    const readingList = parsedPlist?.Children?.find(
      (child: { Title: string }) => child?.Title === "com.apple.ReadingList"
    ) as ReadingListItem;

    console.log(readingList);

    if (!readingList) {
      console.warn("No Reading List found in the plist.");
      return [];
    }

    const readingListItems = readingList.Children.map((item) => {
      const nonSync = item.ReadingListNonSync || {};
      const readingListData = item.ReadingList || {};
      const uriDict = item.URIDictionary || {};

      return {
        url: item.URLString,
        title: nonSync.Title || uriDict.title || "Untitled",
        dateAdded: readingListData.DateAdded,
        dateLastViewed: readingListData.DateLastViewed,
        previewText: nonSync.PreviewText || readingListData.PreviewText,
        siteName: nonSync.siteName,
        dateLastFetched: nonSync.DateLastFetched,
      };
    });

    // Filter out items that have been deleted
    const filteredItems = readingListItems.filter((item) => {
      const deletedValue = localStorage.getItem(`deleted_${item.url}`);
      return deletedValue === null; // If there's any value, it means the item was deleted
    });

    return filteredItems;
  } catch (error) {
    console.error("Failed to read Safari Reading List:", error);
    return [];
  }
}

export default function Newtab(): JSX.Element {
  const [readingList, setReadingList] = useState<ReadingListItemType[]>([]);
  const [rawReadingList, setRawReadingList] = useState<ReadingListItemType[]>(
    []
  );
  const [sortOrder, setSortOrder] = useState<"dateAdded" | "dateLastViewed">(
    "dateAdded"
  );
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const { theme, setTheme } = useContext(ThemeContext);

  // Function to sort reading list items
  const sortReadingList = useCallback(
    (items: ReadingListItemType[], order: "dateAdded" | "dateLastViewed") => {
      return [...items].sort((a, b) => {
        // Get the date values, defaulting to 0 if missing
        const dateA = a[order] ? new Date(a[order] as string).getTime() : 0;
        const dateB = b[order] ? new Date(b[order] as string).getTime() : 0;

        // If both dates are missing or equal, sort by URL for consistency
        if (dateA === dateB) {
          return a.url.localeCompare(b.url);
        }

        // If only one date is missing, prioritize the item with a date
        if (dateA === 0) return 1;
        if (dateB === 0) return -1;

        // Normal date comparison (newest first)
        return dateB - dateA;
      });
    },
    []
  );

  // Load settings and reading list data
  useEffect(() => {
    // First load settings from storage
    Browser.storage.local
      .get(["sortOrder", "layout", "theme"])
      .then((result) => {
        // Update state with stored settings
        const storedSortOrder = result.sortOrder as
          | "dateAdded"
          | "dateLastViewed";
        if (storedSortOrder) {
          setSortOrder(storedSortOrder);
        }

        if (result.layout) {
          setLayout(result.layout as "grid" | "list");
        }

        if (result.theme && setTheme) {
          setTheme(result.theme as Theme);
        }

        // Then load the reading list with the correct sort order
        setIsLoading(true);
        getReadingList()
          .then((items) => {
            setRawReadingList(items);
            // Apply the correct sort order (use stored value if available)
            const sortedItems = sortReadingList(
              items,
              storedSortOrder || sortOrder
            );
            setReadingList(sortedItems);
          })
          .catch((error) => {
            console.error("Error loading reading list:", error);
          })
          .finally(() => {
            setIsLoading(false);
          });
      });

    // Listen for changes in settings
    const handleStorageChange = (changes: {
      [key: string]: Browser.Storage.StorageChange;
    }) => {
      if (changes.sortOrder) {
        const newSortOrder = changes.sortOrder.newValue as
          | "dateAdded"
          | "dateLastViewed";
        setSortOrder(newSortOrder);
        // Re-sort the list when sort order changes
        setReadingList(sortReadingList(rawReadingList, newSortOrder));
      }
      if (changes.layout) {
        setLayout(changes.layout.newValue as "grid" | "list");
      }
      if (changes.theme && setTheme) {
        setTheme(changes.theme.newValue as Theme);
      }
    };

    Browser.storage.onChanged.addListener(handleStorageChange);

    return () => {
      Browser.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [sortReadingList, setTheme, sortOrder]);

  // Load reading list data
  const loadReadingList = useCallback(async () => {
    setIsLoading(true);
    try {
      const items = await getReadingList();
      setRawReadingList(items);
      // Apply sort order consistently
      const sortedItems = sortReadingList(items, sortOrder);
      setReadingList(sortedItems);
    } catch (error) {
      console.error("Error loading reading list:", error);
    } finally {
      setIsLoading(false);
    }
  }, [sortOrder, sortReadingList]);

  // Function to delete a reading list item
  const deleteItem = async (url: string) => {
    try {
      // Remove from UI immediately for better UX
      const updatedList = rawReadingList.filter((item) => item.url !== url);
      setRawReadingList(updatedList);
      setReadingList(sortReadingList(updatedList, sortOrder));

      // Call the native messaging host to delete the item
      const response: { success: boolean; error?: string; message?: string } =
        await Browser.runtime.sendNativeMessage(
          "com.wtf403.safari_reading_list",
          {
            command: "deleteBookmark",
            url: url,
          }
        );

      // Check if the deletion was successful
      if (!response.success) {
        console.error("Failed to delete bookmark:", response.error);
        // If deletion failed, store in localStorage as a fallback with timestamp
        localStorage.setItem(`deleted_${url}`, new Date().toISOString());
      } else {
        console.log(`Item deleted: ${url}`, response.message);
        // Remove from localStorage if it was previously marked as deleted
        localStorage.removeItem(`deleted_${url}`);

        // No need to reload the entire list since we've already updated the UI
        // This prevents the page from scrolling to the top
      }
    } catch (error) {
      console.error("Failed to delete item:", error);
      // Store in localStorage as a fallback if native messaging fails
      localStorage.setItem(`deleted_${url}`, new Date().toISOString());
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        {isLoading ? (
          <div className="loading-indicator">Loading...</div>
        ) : (
          <>
            <div className={`reading-list ${layout}`}>
              {readingList.length === 0 ? (
                <div className="empty-state">
                  <p>No reading list items found.</p>
                </div>
              ) : (
                readingList.map(
                  ({
                    url,
                    title,
                    dateAdded,
                    dateLastViewed,
                    previewText,
                    siteName,
                  }) => (
                    <div key={url} className="reading-list-item">
                      <div className="item-content">
                        <a href={url} className="item-link">
                          <div className="preview-image">
                            <img
                              src={`https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${url}&size=128`}
                              alt=""
                              onError={(e) => {
                                (e.target as HTMLImageElement).src =
                                  "default-favicon.png";
                              }}
                            />
                          </div>
                          <div className="item-details">
                            <h3>{title}</h3>
                            {siteName && (
                              <span className="site-name">{siteName}</span>
                            )}
                            {previewText && (
                              <p className="preview-text">{previewText}</p>
                            )}
                            <div className="date-info">
                              {dateAdded && (
                                <small>
                                  Added:{" "}
                                  {new Date(dateAdded).toLocaleDateString()}
                                </small>
                              )}
                              {dateLastViewed && (
                                <small>
                                  Last visited:{" "}
                                  {new Date(
                                    dateLastViewed
                                  ).toLocaleDateString()}
                                </small>
                              )}
                            </div>
                          </div>
                        </a>
                        <button
                          className="delete-button"
                          onClick={(e) => {
                            e.preventDefault();
                            deleteItem(url);
                          }}
                          aria-label="Delete item"
                          title="Delete from reading list"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  )
                )
              )}
            </div>
          </>
        )}
      </header>
    </div>
  );
}
