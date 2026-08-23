<p align="center">
  <img src="src-tauri/icons/command-vault.svg" width="112" alt="Command Vault icon" />
</p>

<h1 align="center">Command Vault</h1>

<p align="center">
  A lightweight, local-first desktop vault for technical commands.
</p>

<p align="center">
  <strong>Current version: 0.6.0</strong>
</p>

<p align="center">
  <a href="#english">English</a> · <a href="#tiếng-việt">Tiếng Việt</a>
</p>

---

## English

### About

Command Vault is a native desktop application for organizing, searching, and safely using technical command references such as Linux, Nmap, Wireshark, tcpdump, Git, PowerShell, and Cisco commands.

The filesystem is the source of truth: folders in the Explorer are real folders, and every command collection is a readable UTF-8 `.cmdnote` JSON file. Command Vault uses no database, cloud service, account, telemetry, or background daemon.

### Highlights

- Native Tauri desktop app, optimized first for Kali Linux GNOME.
- Vanilla TypeScript, HTML, CSS, and Rust—no frontend framework.
- Fast lazy Section rendering and virtual scrolling for large command vaults.
- Nested filesystem Explorer with create, rename, delete, and refresh actions.
- Section and command CRUD, duplication, reordering, and moving between sections.
- Compact Table sections for dense command/port/function references without creating oversized cards.
- Paste-to-import GPT tables with automatic Markdown, TSV, and CSV detection plus a validation preview.
- Example switch for every Section with examples.
- Copy-only command handling with a smaller, simpler command schema.
- Ranked typo-tolerant in-memory search with `Ctrl+K`.
- Persisted whole-interface scaling from 75% to 200%, with `Ctrl++`, `Ctrl+-`, and `Ctrl+0` shortcuts.
- Atomic file writes and external-edit conflict detection.
- Resilient handling for malformed JSON, invalid schemas, missing files, and permissions.
- Dark and Light themes with Cyan, Blue, Purple, Green, Orange, and Pink accents.

### Interface size and accessibility

Version 0.6.0 adds typo-tolerant search plus persistent Dark/Light appearance and six accent presets.

- Open **Settings → UI scale** and choose any value from 75% to 200%.
- Press `Ctrl++` to increase scale by 10%.
- Press `Ctrl+-` to decrease scale by 10%.
- Press `Ctrl+0` to return to 100%.
- Scale, UI font size, and code font size are persisted between launches.

### Search and appearance

- Search ranks exact matches first, then accepts balanced one- or two-character typos such as `namp` for `nmap`.
- Search is accent-insensitive, so an unaccented query such as `mat khau` matches `mật khẩu`.
- Open **Settings → Appearance** to preview Dark or Light with any of the six accent colors.
- **SAVE** persists the preview; **CANCEL**, `Esc`, or closing Settings restores the previous theme.

### Compact tables

Use **+ ADD TABLE** when many related commands or values should be scanned as one dense reference—for example common ports, Nmap scan modes, service probes, or Wireshark filters.

- The left 42% column contains an automatically maintained row number, generated command/value, and a COPY button at the end of every row.
- Table rows do not require a separate Name or Label; numbering updates automatically after add, delete, duplicate, or reorder operations.
- The Information column contains Description and MORE/LESS details for Notes and hidden Examples.
- Existing sections can switch between **Use Compact Table** and **Use Standard Rows** from the section menu without losing data.
- Add, edit, duplicate, reorder, move, delete, search, and copy behavior are shared with regular commands.

### Example column

When any Section contains at least one Example, its **EXAMPLES** switch is available in the section header and the third column appears automatically. Toggle the switch to hide or show that column for the current app session.

- The visible layout is **35% Command / 35% Information / 30% Example**.
- Click an Example cell to copy its exact text; an empty Example displays `—`.
- When the column is visible, Example is not duplicated inside MORE. Hide the column to see it in MORE again.

### Paste a GPT table

Click **+ ADD TABLE**, enter the table name, then paste a table. The live preview detects Markdown, TSV (Excel/Google Sheets), and CSV; it shows errors before anything is saved. Leave the paste field empty to create a blank Compact Table.

Use a header row. `Command`, `Port`, or `Value` is required; the importer also recognizes `Service`, `Description`/`Information`, `Example`, and `Notes` in English or Vietnamese. A separate Service value is appended to Command after a tab. Syntax, Action, Risk, and Variables are rejected.

Ask GPT for this output format:

```text
Return only a Markdown table with the columns: Command, Service, Description, Example, Notes.
```

### Technology

```text
Tauri 2
Vanilla TypeScript
HTML
CSS
Rust
```

Only one functional Tauri plugin is used: the official dialog plugin for the native folder picker.

### Kali/Debian prerequisites

```bash
sudo apt update
sudo apt install pkg-config libwebkit2gtk-4.1-dev librsvg2-dev
```

Install the stable Rust toolchain through [rustup](https://rustup.rs/) and install Node.js/npm if they are not already available.

### Development

```bash
npm install
npm run tauri dev
```

Build the frontend only:

```bash
npm run build
```

### Tests and checks

```bash
npm run test:model
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --all-targets --manifest-path src-tauri/Cargo.toml -- -D warnings
npm audit --omit=dev
```

The project includes:

- TypeScript tests for parsing, migration, fuzzy ranking, accent normalization, import validation, IDs, and large-list behavior.
- Rust tests for workspace confinement, symlink rejection, atomic writes, stale-write protection, filesystem CRUD, and backward-compatible settings.
- A no-dependency Tauri IPC integration harness at `e2e.html`.
- Frontend stress scenarios at `/?stress=100`, `/?stress=1000`, and `/?stress=5000` during development.

### Release build

```bash
npm run tauri build
```

Smoke-test an AppImage without reading or writing your real workspace settings:

```bash
npm run smoke:appimage -- artifacts/CommandVault_0.6.0_amd64.AppImage
```

Configured Linux outputs:

```text
src-tauri/target/release/bundle/deb/
src-tauri/target/release/bundle/appimage/
```

The release profile enables LTO, size optimization, panic abort, and symbol stripping. Generated packages and build outputs are intentionally excluded from Git; publish binaries through GitHub Releases.

### Workspace format

```text
CommandVault/
├── Network/
│   ├── Wireshark.cmdnote
│   ├── Nmap.cmdnote
│   └── tcpdump.cmdnote
├── Linux/
│   └── Terminal.cmdnote
└── Development/
    └── Git.cmdnote
```

Minimal `.cmdnote` file:

```json
{
  "version": 2,
  "title": "Nmap",
  "description": "Network scanning commands",
  "sections": []
}
```

### Data safety

- Version 1 command files are migrated atomically to version 2 when the workspace opens.
- Version 2 files require Command Vault 0.5.0 or newer; do not reopen them with 0.4.x.
- The AppImage smoke script uses isolated XDG folders and never opens the user's saved workspace.
- Workspace paths are canonicalized and confined to the selected root.
- Symbolic links are not traversed or managed.
- Command files have a 5 MiB safety limit.
- Saves use a same-directory temporary file, sync, and atomic rename on Linux.
- Disk content is compared with the loaded version before save, preventing accidental overwrite of external edits.

---

## Tiếng Việt

### Giới thiệu

Command Vault là ứng dụng desktop dùng để tổ chức, tìm kiếm và sử dụng an toàn các câu lệnh kỹ thuật như Linux, Nmap, Wireshark, tcpdump, Git, PowerShell và Cisco.

Filesystem là nguồn dữ liệu duy nhất: folder trong Explorer là folder thật, và mỗi bộ câu lệnh là một file JSON `.cmdnote` UTF-8 có thể đọc bằng text editor. Command Vault không sử dụng database, cloud, tài khoản, telemetry hoặc daemon chạy nền.

### Tính năng nổi bật

- Ứng dụng desktop Tauri thực sự, ưu tiên Kali Linux GNOME.
- Vanilla TypeScript, HTML, CSS và Rust—không dùng frontend framework.
- Lazy Section và virtual scrolling giúp kho command lớn vẫn mượt.
- Explorer filesystem lồng nhau với tạo, đổi tên, xóa và refresh.
- CRUD section/command, duplicate, sắp xếp và chuyển command giữa các section.
- Compact Table để tổng hợp dày các command, port hoặc chức năng liên quan mà không tạo quá nhiều card lớn.
- Paste/import bảng do GPT tạo, tự nhận diện Markdown, TSV và CSV kèm preview kiểm tra dữ liệu.
- Example switch cho mọi Section có ví dụ.
- Chỉ giữ thao tác COPY và schema command gọn nhẹ.
- Tìm kiếm toàn workspace có xếp hạng và chịu lỗi chính tả bằng `Ctrl+K`.
- Scale toàn giao diện từ 75% đến 200%, được lưu tự động; hỗ trợ `Ctrl++`, `Ctrl+-` và `Ctrl+0`.
- Ghi file atomic và phát hiện xung đột khi file bị sửa bên ngoài.
- Không crash khi JSON lỗi, schema sai, file bị xóa hoặc thiếu quyền.
- Theme Dark/Light với sáu accent Cyan, Blue, Purple, Green, Orange và Pink.

### Kích thước giao diện và khả năng đọc

Phiên bản 0.6.0 bổ sung fuzzy search chịu lỗi chính tả cùng Dark/Light và sáu màu accent được lưu tự động.

- Mở **Settings → UI scale** và chọn giá trị từ 75% đến 200%.
- Nhấn `Ctrl++` để tăng scale 10%.
- Nhấn `Ctrl+-` để giảm scale 10%.
- Nhấn `Ctrl+0` để trở về 100%.
- UI scale, UI font size và code font size được lưu giữa các lần mở ứng dụng.

### Tìm kiếm và giao diện

- Search ưu tiên kết quả chính xác, sau đó chấp nhận sai một hoặc hai ký tự như `namp` thay cho `nmap`.
- Search không phân biệt dấu tiếng Việt, nên `mat khau` vẫn tìm được `mật khẩu`.
- Mở **Settings → Appearance** để xem thử Dark hoặc Light với một trong sáu màu accent.
- **SAVE** lưu lựa chọn; **CANCEL**, `Esc` hoặc đóng Settings sẽ trả về theme trước đó.

### Bảng compact

Sử dụng **+ ADD TABLE** khi cần xem nhiều command hoặc giá trị liên quan trong cùng một bảng—ví dụ danh sách port phổ biến, các chế độ scan Nmap, service probe hoặc Wireshark filter.

- Cột trái 42% chứa số thứ tự tự động, command/value đã generate và nút COPY ở cuối mỗi hàng.
- Hàng trong bảng không cần nhập Name hoặc Label; số thứ tự tự cập nhật sau khi thêm, xóa, duplicate hoặc sắp xếp lại.
- Cột Information chứa Description và MORE/LESS cho Notes cùng Example khi cột Example đang ẩn.
- Section hiện có có thể chuyển giữa **Use Compact Table** và **Use Standard Rows** từ section menu mà không mất dữ liệu.
- Add, edit, duplicate, reorder, move, delete, search và COPY dùng chung với command thông thường.

### Cột Example

Khi một Section có ít nhất một Example, switch **EXAMPLES** xuất hiện ở section header và cột thứ ba tự hiển thị. Bật/tắt switch để đổi trạng thái trong phiên ứng dụng hiện tại.

- Bố cục khi hiện là **35% Command / 35% Information / 30% Example**.
- Nhấn trực tiếp vào ô Example để copy đúng nội dung; Example trống hiển thị `—`.
- Khi cột đang hiện, Example không lặp lại trong MORE; ẩn cột để xem Example trong MORE trở lại.

### Paste bảng từ GPT

Nhấn **+ ADD TABLE**, nhập tên bảng rồi paste dữ liệu. Preview sẽ tự nhận diện Markdown, TSV (Excel/Google Sheets) và CSV; lỗi được hiện trước khi bất kỳ dữ liệu nào được lưu. Có thể để trống vùng paste để tạo Compact Table rỗng.

Bảng cần có hàng header. Cột bắt buộc là `Command`, `Port` hoặc `Value`; importer cũng nhận `Service`, `Description`/`Information`, `Example` và `Notes` bằng tiếng Anh hoặc tiếng Việt. Nếu Service nằm ở cột riêng, ứng dụng ghép nó vào Command bằng một tab. Syntax, Action, Risk và Variables sẽ bị chặn.

Bạn có thể yêu cầu GPT theo mẫu sau:

```text
Chỉ trả về một bảng Markdown với các cột: Command, Service, Description, Example, Notes.
```

### Công nghệ

```text
Tauri 2
Vanilla TypeScript
HTML
CSS
Rust
```

Chỉ sử dụng một plugin chức năng của Tauri: dialog plugin chính thức để mở native folder picker.

### Dependency cho Kali/Debian

```bash
sudo apt update
sudo apt install pkg-config libwebkit2gtk-4.1-dev librsvg2-dev
```

Cài Rust stable bằng [rustup](https://rustup.rs/) và cài Node.js/npm nếu hệ thống chưa có.

### Chạy môi trường development

```bash
npm install
npm run tauri dev
```

Chỉ build frontend:

```bash
npm run build
```

### Test và kiểm tra code

```bash
npm run test:model
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --all-targets --manifest-path src-tauri/Cargo.toml -- -D warnings
npm audit --omit=dev
```

Project bao gồm:

- TypeScript tests cho parser, migration, fuzzy ranking, chuẩn hóa dấu, import validation, ID và large-list behavior.
- Rust tests cho workspace boundary, symlink, atomic write, chống stale write, filesystem CRUD và settings tương thích ngược.
- Tauri IPC integration harness không cần dependency bổ sung tại `e2e.html`.
- Frontend stress scenarios tại `/?stress=100`, `/?stress=1000` và `/?stress=5000` trong development.

### Build bản release

```bash
npm run tauri build
```

Smoke-test AppImage mà không đọc hoặc ghi settings/workspace thật:

```bash
npm run smoke:appimage -- artifacts/CommandVault_0.6.0_amd64.AppImage
```

Output Linux:

```text
src-tauri/target/release/bundle/deb/
src-tauri/target/release/bundle/appimage/
```

Release profile sử dụng LTO, tối ưu kích thước, panic abort và strip symbol. Package sinh ra và build output không được commit vào Git; binary nên được publish bằng GitHub Releases.

### Cấu trúc workspace

```text
CommandVault/
├── Network/
│   ├── Wireshark.cmdnote
│   ├── Nmap.cmdnote
│   └── tcpdump.cmdnote
├── Linux/
│   └── Terminal.cmdnote
└── Development/
    └── Git.cmdnote
```

File `.cmdnote` tối thiểu:

```json
{
  "version": 2,
  "title": "Nmap",
  "description": "Các lệnh quét mạng",
  "sections": []
}
```

### An toàn dữ liệu

- File command version 1 được migration atomically sang version 2 khi workspace mở.
- File version 2 yêu cầu Command Vault 0.5.0 trở lên; không mở lại bằng bản 0.4.x.
- Script smoke-test AppImage dùng XDG folder cô lập và không mở workspace đã lưu của người dùng.
- Mọi path được canonicalize và giới hạn trong workspace đã chọn.
- Không traverse hoặc quản lý symbolic link.
- File command có giới hạn an toàn 5 MiB.
- Khi save, app ghi file tạm cùng folder, sync và atomic rename trên Linux.
- Nội dung trên disk được so sánh với phiên bản đã load trước khi save, tránh ghi đè thay đổi từ bên ngoài.

---

## License

No license has been selected yet. Add a license before accepting external contributions.
