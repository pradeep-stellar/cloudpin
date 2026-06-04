CREATE VIRTUAL TABLE bookmarks_fts USING fts5(
  title,
  description,
  notes,
  url,
  content='bookmarks',
  content_rowid='id'
);

--> statement-breakpoint

CREATE TRIGGER bookmarks_fts_ai AFTER INSERT ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(rowid, title, description, notes, url)
  VALUES (new.id, new.title, new.description, new.notes, new.url);
END;

--> statement-breakpoint

CREATE TRIGGER bookmarks_fts_ad AFTER DELETE ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(bookmarks_fts, rowid, title, description, notes, url)
  VALUES ('delete', old.id, old.title, old.description, old.notes, old.url);
END;

--> statement-breakpoint

CREATE TRIGGER bookmarks_fts_au AFTER UPDATE ON bookmarks BEGIN
  INSERT INTO bookmarks_fts(bookmarks_fts, rowid, title, description, notes, url)
  VALUES ('delete', old.id, old.title, old.description, old.notes, old.url);
  INSERT INTO bookmarks_fts(rowid, title, description, notes, url)
  VALUES (new.id, new.title, new.description, new.notes, new.url);
END;

--> statement-breakpoint

INSERT INTO bookmarks_fts(bookmarks_fts) VALUES ('rebuild');