# 全国8厚生（支）局の公表先確認

確認日：2026年10月16日（日本時間）。対象はまず医科の病院・診療所です。「全項目」は主な届出項目だけに限定せず、全体版の名簿に記録された施設基準を対象に照合する要件です。歯科・薬局・訪問看護の取込みは別スコープです。

| 厚生（支）局 | 都道府県数 | 医療機関一覧                                                                                               | 届出全体版                                                                                               | 掲載形式・注意点                                                                              |
| ------------ | ---------: | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 北海道       |          1 | [コード内容別](https://kouseikyoku.mhlw.go.jp/hokkaido/gyomu/gyomu/hoken_kikan/code_ichiran.html)          | [届出名簿](https://kouseikyoku.mhlw.go.jp/hokkaido/gyomu/gyomu/hoken_kikan/todokede_juri_ichiran.html)   | Excel。医療機関一覧は病院・診療所が別ファイル。正式名称の出典は基本診療料・特掲診療料の通知。 |
| 東北         |          6 | [指定一覧](https://kouseikyoku.mhlw.go.jp/tohoku/gyomu/gyomu/hoken_kikan/itiran.html)                      | [届出名簿](https://kouseikyoku.mhlw.go.jp/tohoku/gyomu/gyomu/hoken_kikan/documents/201805koushin.html)   | 6県分Excel。全体版・項目別・直近変更資料を区別。略称一覧あり。                                |
| 関東信越     |         10 | [指定一覧](https://kouseikyoku.mhlw.go.jp/kantoshinetsu/chousa/shitei.html)                                | [届出名簿](https://kouseikyoku.mhlw.go.jp/kantoshinetsu/chousa/kijyun.html)                              | 医科ZIP。略称一覧あり。指定一覧と届出一覧の基準月が異なる場合あり。                           |
| 東海北陸     |          6 | [コード内容別](https://kouseikyoku.mhlw.go.jp/tokaihokuriku/newpage_00287.html)                            | [届出全体版](https://kouseikyoku.mhlw.go.jp/tokaihokuriku/newpage_00349.html)                            | 医科ZIP。全体版と「主な項目別」の資料を区別。略称一覧あり。                                   |
| 近畿         |          7 | [指定一覧](https://kouseikyoku.mhlw.go.jp/kinki/tyousa/shinkishitei.html)                                  | [届出全体版](https://kouseikyoku.mhlw.go.jp/kinki/gyomu/gyomu/hoken_kikan/shitei_jokyo_00004.html)       | 医科ZIP。略称一覧・加算名対照表あり。                                                         |
| 中国四国     |          5 | [コード内容別](https://kouseikyoku.mhlw.go.jp/chugokushikoku/chousaka/iryoukikanshitei.html)               | [届出全体版](https://kouseikyoku.mhlw.go.jp/chugokushikoku/chousaka/shisetsukijunjuri.html)              | 各県分ZIP。略称対応資料あり。全体版のZIP内の区分は実物で確認が必要。                          |
| 四国厚生支局 |          4 | [指定一覧・コード内容別](https://kouseikyoku.mhlw.go.jp/shikoku/gyomu/gyomu/hoken_kikan/shitei/index.html) | [同ページの届出全体版](https://kouseikyoku.mhlw.go.jp/shikoku/gyomu/gyomu/hoken_kikan/shitei/index.html) | 同ページに複数種類のZIP。資料区分の取り違え防止が必要。略称一覧あり。                         |
| 九州         |          8 | [コード内容別](https://kouseikyoku.mhlw.go.jp/kyushu/gyomu/gyomu/hoken_kikan/index_00006.html)             | [届出全体版](https://kouseikyoku.mhlw.go.jp/kyushu/gyomu/gyomu/hoken_kikan/index_00007.html)             | 県別ZIP・過去月資料あり。沖縄を含む。略称一覧あり。                                           |

## 取得テストの現在の結果

- 8局の公式公表先とExcel/ZIP提供の案内を、Web検索・公式ページの閲覧で確認しました。
- 開発環境から北海道の公式ページにHTTPS接続した実測結果は `CONNECT tunnel failed, response 403` です。環境の許可ホストに公式ホストが含まれていません。
- 全局が同じ `kouseikyoku.mhlw.go.jp` ホストを使用します。この制限の下で同じ拒否要求を繰り返していません。
- **8局の原本ダウンロード、全行解析、全届出項目の抽出、正式名称対応率100%、47都道府県の結合は未検証です。** 公表先の確認を全件取得成功とは扱いません。
- 実測の全国件数や届出項目数は未取得のため記載しません。

通信許可後に `python scripts/acquisition_audit.py --output work/acquisition --mode all` を実行すると、局別の取得状態・ファイルURL・SHA256・全シート名・行列数を記録できます。これは原本取得と読込の監査です。医療機関/届出への意味的な変換処理と正式名称対応表の構築は次に必要です。

## 全件取得と判定するための条件

1. 8局・47都道府県の医科の病院・診療所を網羅し、旧月・歯科等との混入を排除。
2. 医療機関一覧に対し、医療機関ID・名称・住所・病床数・開設者区分・診療科目の欠落率と原本件数を突合。
3. 届出全体版の全シート・継続行・結合セル・複数受理番号を解析し、読飛ばし行を0件にするか理由を記録。
4. 全ての元略称をその資料の基準日・適用期間に有効な公式正式名称へ一意に照合。未対応・曖昧一致は0件必須。
5. 加算区分や複数項目を安易にまとめない。局の対照表・告示/通知上の定義と突合。
6. 届出がない医療機関も一覧に残す。名簿未掲載と「実際に届出がない」を同一視せず、公表資料の基準日時点での記載状況として表示。
7. 前月比の異常な件数減少・欠落県・出典月の後退があれば公開版を維持して停止。
8. 20日の取得失敗局は25日に再取得し、同月の保存状態を引き継ぐ。20日取得済みの原本を不要に取り直さない。

正式名称対応マスターは、局・改定時期・略称・正式名称・公式出典を保持します。略称をDBの名称欄へそのまま入れる処理や、AIによる推測展開は行いません。
