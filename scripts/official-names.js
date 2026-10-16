// Never guess a full name from an abbreviation. A reviewed, dated official source is required.
export function resolveOfficialName({ bureau, abbreviation, asOf }, mappings) {
  const found = mappings.filter(
    (m) =>
      m.bureau === bureau &&
      m.abbreviation === abbreviation &&
      m.valid_from <= asOf &&
      (!m.valid_to || m.valid_to >= asOf),
  );
  if (
    found.length !== 1 ||
    !found[0].official_name ||
    !/^https:\/\/(?:kouseikyoku\.mhlw\.go\.jp|www\.mhlw\.go\.jp)\//.test(
      found[0].source_url,
    )
  )
    throw new Error(
      `正式名称を一意に照合できません: ${bureau} / ${abbreviation} / ${asOf}`,
    );
  return {
    code: found[0].code,
    official_name: found[0].official_name,
    source_abbreviation: abbreviation,
    source_url: found[0].source_url,
  };
}
export function assertAllItemsMapped(items, mappings) {
  return items.map((item) => ({
    ...item,
    ...resolveOfficialName(item, mappings),
  }));
}
