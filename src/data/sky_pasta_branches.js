export const SKY_PASTA_BRANCHES = [
  {
    branch: "Pamulang",
    area: "tangerang-selatan",
    slug: "sky-pasta-signature-pamulang-bd96dd68-4bd3-41e2-8fde-ce7ea7b1c41c",
    altUuid: null,
  },
  {
    branch: "Tebet",
    area: "jakarta",
    slug: "sky-pasta-tebet-594d2e42-b1fd-44f2-83a9-da53b2210842",
    altUuid: null,
  },
  {
    branch: "Cinere",
    area: "depok",
    slug: "sky-pasta-cinere-43373425-c78e-4dd4-a4e5-23d58e701cae",
    altUuid: null,
  },
  {
    branch: "Ciledug",
    area: "jakarta",
    slug: "sky-pasta-ciledug-423518a4-dea9-46b0-ab0e-015e0129a38f",
    altUuid: null,
  },
  {
    branch: "Petukangan",
    area: "jakarta",
    slug: "sky-pasta-petukangan-03ba0e0d-e52b-4531-a140-69cac28c986f",
    altUuid: null,
  },
  {
    branch: "Binus Jakbar",
    area: "jakarta",
    slug: "sky-pasta-binus-jakbar-2e05c08c-0485-47a6-b128-acaf8d39271f",
    altUuid: "dd55f44c-4a1b-4329-a31c-295f284d0885",
  },
  {
    branch: "Galaxy Bekasi",
    area: "jakarta",
    slug: "sky-pasta-taman-galaxy-bekasi-c4b7588e-a2e5-4fae-bd07-3a99c66edf22",
    altUuid: null,
  },
];

export function uuidFromSlug(slug) {
  const m = slug.match(/-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/);
  return m ? m[1] : null;
}

export function findBranch(name) {
  const needle = String(name).toLowerCase();
  return (
    SKY_PASTA_BRANCHES.find(
      (b) =>
        b.branch.toLowerCase() === needle ||
        b.branch.toLowerCase().replace(/\s+/g, "").includes(needle.replace(/\s+/g, "")) ||
        b.slug.includes(needle),
    ) || null
  );
}