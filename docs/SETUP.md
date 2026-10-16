# 専用環境の設定と設計

## Supabase

対象は **leczxapskgixlzykdovz** のみです。適用前にダッシュボードのプロジェクトIDを確認してください。

1. このプロジェクトのSQL Editorで `supabase/migrations/202610160001_workspace.sql` を実行します。
2. Authenticationで利用者を作成し、一般公開の新規登録を無効にします。
3. SQL Editorで作成した利用者UUIDを `public.app_users.user_id` に登録します。UUIDは秘密鍵ではありません。
4. `.env.example` を `.env.local` として作成し、`VITE_SUPABASE_PUBLISHABLE_KEY` に同プロジェクトの公開キーを設定します。
5. `VITE_SUPABASE_URL` は `https://leczxapskgixlzykdovz.supabase.co` です。アプリは他のURLの設定を拒否します。
6. 再起動後にログイン・空データ表示・少量取込・顧問先メモ保存を実プロジェクトで確認してください。

`service_role`、`sb_secret_...`、DBパスワード、アクセストークンを `VITE_` 変数・GitHub・チャットへ入れないでください。公開キーはRLSによりアクセス範囲が制限されます。本アプリでは管理用秘密鍵を必要としません。

## データ構造

| テーブル         | 役割                                                       |
| ---------------- | ---------------------------------------------------------- |
| app_users        | 管理者が許可した利用者                                     |
| facilities       | 医療機関、病床数、開設者区分、診療科目、届出一覧確認基準日 |
| filing_catalog   | 届出コードと **official_name（正式名称）**                 |
| filing_aliases   | 局別の元略称、対応コード、適用期間、公式出典URL            |
| facility_filings | 医療機関と届出項目の対応、受理日                           |
| clients          | 顧問先の登録とメモ                                         |
| workspace_meta   | 反映日時と取得元資料の記録                                 |

データは利用者単位で分離します。将来の販売時に複数人で同じ組織データを共有する場合は、組織ID・権限モデルを追加する設計変更が必要です。

`replace_dataset` は原子的に入れ替えます。残る医療機関の顧問先情報は保持し、削除された医療機関に紐づく顧問先は削除されます。履歴保管は次段階です。正式名称は略称から推測しません。公式対応表で一意に照合できない場合に更新を止める解決関数を実装していますが、実データ対応表と自動変換処理への組込みは未完了です。

## CSV

UTF-8の2種類のCSVをまとめて検証します。列は画面のテンプレートから取得できます。

- 医療機関：`facility_id,name,prefecture,postal_code,address,beds,owner_type,departments,coverage_complete,coverage_as_of`
- 届出：`facility_id,code,official_name,accepted_on`
- `departments` は `内科|外科` の形式です。
- `coverage_complete` は `true` / `false`。`true` の場合は `coverage_as_of` を必須とします。
- 日付は `YYYY-MM-DD`。病床数は0以上の整数です。
- 全国の医療機関IDは都道府県番号・医科等の区分を含む安定したIDへ正規化する必要があります。7桁の医療機関番号だけの全国結合は禁止します。
- 取込CSVの正式名称が公式対応表と一致することは、現在の手動CSV取込では自動証明しません。

## 通信設定

クラウド環境のネットワーク許可ホストに次を追加する必要があります。GitHubのRepository accessとは別設定です。

- `kouseikyoku.mhlw.go.jp`（名簿・略称対応表）
- `www.mhlw.go.jp`（正式名称を定義する通知）
- `leczxapskgixlzykdovz.supabase.co`（今回専用のアプリDB・認証）

設定変更後はクラウド環境への反映が必要です。状態確認ツールでホストと変数がreadyであることを確認してください。

## 月次監査

`acquisition-audit.yml` は日本時間20日・25日の06:00に対応するUTC cronです。GitHub Actionsの実行時刻には遅延があり得ます。

初期状態の定期実行は無効です。実資料テストを完了後、今回のリポジトリだけのActions変数 `ENABLE_ACQUISITION_AUDIT=true` で取得監査を有効化します。これはDB更新を有効化するものではありません。

20日は全局を取得し、25日は同月の保存済み状態を復元して取得失敗局だけを再取得します。同月の状態が見つからなければ停止します。翌月は新規状態を作ります。状態・原本はActions Artifactに35日間保存します。現在の監査スクリプトは公表ページにある全Excel/ZIPリンクを取得するため、過去月や歯科・薬局資料も監査対象に含みます。医科だけの現行月変換は局別パーサの実装時に限定します。

今後の本番更新は、全局の現行対象資料・47都道府県・全届出項目・正式名称照合を検証してから1つの版として切り替える方式です。原本ダウンロード成功だけで本番入替しません。

## 公開

現在のGitHubリポジトリは公開です。顧問先、管理メモ、実運用CSV、秘密情報をコミットしないでください。外部へのアプリ公開・ホスティングは未設定です。
