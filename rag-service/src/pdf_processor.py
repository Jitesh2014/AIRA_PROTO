import os
import re
from typing import Dict, List

import fitz
import pandas as pd
import pdfplumber

CHAPTER_HEADER = re.compile(
    r"(?m)^(?:CHAPTER|Chapter|UNIT|Unit)\s+(\d+)\s*[:\.\-]?\s*(.*?)\s*$"
)
PAGE_MARKER = re.compile(r"\[PAGE\s+(\d+)\]")


def pages_from_text(text: str) -> str:
    pages = sorted({int(m.group(1)) for m in PAGE_MARKER.finditer(text)})
    if not pages:
        return ""
    if len(pages) == 1:
        return str(pages[0])
    return f"{pages[0]}-{pages[-1]}"


class PDFProcessor:
    def __init__(self, pdf_path: str):
        self.pdf_path = pdf_path
        self.doc = fitz.open(pdf_path)

    def extract_tables_with_pdfplumber(self) -> List[Dict]:
        tables_data = []

        try:
            with pdfplumber.open(self.pdf_path) as pdf:
                for page_num, page in enumerate(pdf.pages):
                    tables = page.extract_tables()
                    for table_idx, table in enumerate(tables):
                        if table and len(table) > 1:
                            df = pd.DataFrame(table).fillna("")
                            tables_data.append(
                                {
                                    "page": page_num + 1,
                                    "table_id": table_idx,
                                    "markdown": df.to_markdown(),
                                    "text": self._table_to_readable_text(df),
                                }
                            )
        except Exception:
            pass

        return tables_data

    def _table_to_readable_text(self, df: pd.DataFrame) -> str:
        if df.empty:
            return ""

        lines = []
        headers = [str(col) if col else "" for col in df.columns]
        lines.append(" | ".join(headers))
        lines.append("-" * 50)

        for _, row in df.iterrows():
            row_values = [str(val) if val else "" for val in row.values]
            lines.append(" | ".join(row_values))

        return "\n".join(lines)

    def extract_formulas_with_regex(self) -> List[str]:
        formulas = []

        try:
            text = ""
            for page_num in range(len(self.doc)):
                text += self.doc[page_num].get_text()

            patterns = [
                r"[a-zA-Z0-9\s\(\)\+\-\*/\^]+=[a-zA-Z0-9\s\(\)\+\-\*/\^]+",
                r"\d+\s*[\+\-\*/]\s*\d+\s*=\s*\d+",
                r"[a-zA-Z]+\s*\([a-zA-Z0-9,\s]+\)\s*=\s*[a-zA-Z0-9\s\+\-\*/\(\)]+",
            ]

            for pattern in patterns:
                formulas.extend(re.findall(pattern, text))
        except Exception:
            pass

        return list(set(formulas))[:50]

    def extract_code_blocks(self) -> List[str]:
        code_blocks = []

        try:
            text = ""
            for page_num in range(len(self.doc)):
                text += self.doc[page_num].get_text()

            patterns = [
                r"```[\s\S]*?```",
                r"def\s+\w+\s*\([^)]*\)\s*:[\s\S]*?(?=\n\S|\Z)",
                r"class\s+\w+:[\s\S]*?(?=\n\S|\Z)",
                r"import\s+\w+",
                r"from\s+\w+\s+import",
            ]

            for pattern in patterns:
                code_blocks.extend(re.findall(pattern, text, re.MULTILINE))
        except Exception:
            pass

        return list(set(code_blocks))[:30]

    def extract_all_content(self) -> Dict:
        full_text = ""
        for page_num in range(len(self.doc)):
            full_text += f"\n[PAGE {page_num + 1}]\n"
            full_text += self.doc[page_num].get_text()
            full_text += "\n"

        tables = self.extract_tables_with_pdfplumber()
        formulas = self.extract_formulas_with_regex()
        code_blocks = self.extract_code_blocks()

        combined_content = [full_text]

        for table in tables:
            combined_content.append(
                f"\n\n[TABLE START]\n{table['markdown']}\n[TABLE END]\n\n"
            )

        for formula in formulas:
            combined_content.append(f"\n[FORMULA] {formula} [/FORMULA]\n")

        for code in code_blocks:
            combined_content.append(f"\n[CODE]\n{code}\n[/CODE]\n")

        return {
            "full_text": full_text,
            "tables": tables,
            "formulas": formulas,
            "code_blocks": code_blocks,
            "combined": "\n".join(combined_content),
        }

    def _format_chapter_block(
        self,
        chapter: str,
        title: str,
        body: str,
        metadata: Dict,
        stats: Dict | None = None,
    ) -> str:
        subject = metadata.get("subject") or ""
        class_name = metadata.get("class") or ""
        stats = stats or {}

        header = f"CHAPTER {chapter}: {title}"
        if subject or class_name:
            header += f" ({subject}, {class_name})".strip(", ")

        if stats:
            header += (
                f"\nSource: {os.path.basename(self.pdf_path)} | "
                f"Pages: {len(self.doc)} | Tables: {stats.get('tables', 0)} | "
                f"Formulas: {stats.get('formulas', 0)} | Code: {stats.get('code_blocks', 0)}"
            )

        return f"{header}\n\n{body.strip()}\n"

    def extract_chapters(self, metadata: Dict) -> List[Dict]:
        """
        Split a PDF into multiple chapters when headers like
        'CHAPTER 1', 'Chapter 2: ...', or 'Unit 3' are found in the text.
        Falls back to a single chapter using upload metadata.
        """
        content = self.extract_all_content()
        combined = content["combined"]
        stats = {
            "tables": len(content["tables"]),
            "formulas": len(content["formulas"]),
            "code_blocks": len(content["code_blocks"]),
        }
        default_title = metadata.get("title") or os.path.basename(self.pdf_path)
        default_chapter = str(metadata.get("chapter") or "1")

        matches = list(CHAPTER_HEADER.finditer(combined))

        if not matches:
            return [
                {
                    "chapter": default_chapter,
                    "title": default_title,
                    "text": self._format_chapter_block(
                        default_chapter,
                        default_title,
                        combined,
                        metadata,
                        stats,
                    ),
                }
            ]

        chapters: List[Dict] = []
        for i, match in enumerate(matches):
            start = match.start()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(combined)
            ch_num = match.group(1)
            ch_title = (match.group(2) or "").strip() or default_title
            body = combined[start:end].strip()

            chapters.append(
                {
                    "chapter": ch_num,
                    "title": ch_title,
                    "text": self._format_chapter_block(
                        ch_num, ch_title, body, metadata, stats if i == 0 else None
                    ),
                }
            )

        print(f"  Detected {len(chapters)} chapter(s) in PDF")
        return chapters

    def close(self) -> None:
        try:
            self.doc.close()
        except Exception:
            pass
