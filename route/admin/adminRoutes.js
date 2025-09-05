// TODO overall sudah oke, bisa di improve cuma udah oke
const Industry = require("../../schema/industrySchema");
const Skill = require("../../schema/skillSchema");
const Provinsi = require("../../schema/provinsiSchema");
const Kabupaten = require("../../schema/kabupatenSchema");
const Kecamatan = require("../../schema/kecamatanSchema");
const Kelurahan = require("../../schema/kelurahanSchema");
const University = require("../../schema/universitySchema");
const StudyProgram = require("../../schema/studyProgramSchema");

const {
  industryDto,
  skillDto,
  provinsiDto,
  kabupatenDto,
  kecamatanDto,
  kelurahanDto,
} = require("./dto");
const { default: axios } = require("axios");
const universitySchema = require("../../schema/universitySchema");
const { roleAuth } = require("../../helper/roleAuth");
const { normalizeSkillName } = require("../../helper/userHelper");
const Company = require("../../schema/companySchema");
const User = require("../../schema/userSchema");
const Review = require("../../schema/reviewSchema");

function toBool(v) {
  if (v === undefined) return undefined;
  if (typeof v === "boolean") return v;
  const s = String(v).toLowerCase();
  return s === "true" || s === "1";
}

function getPaging(req) {
  const page = Math.max(parseInt(req.query.page || "1", 10), 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10), 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

function regexOrNull(q) {
  if (!q) return null;
  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(esc, "i");
}

function escRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

async function adminRoutes(fastify, options) {
  fastify.post(
    "/study-program",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      const program = await new StudyProgram({ name: req.body.name }).save();
      res.code(201).send(program);
    }
  );

  fastify.get("/study-program", async (req, res) => {
    const list = await StudyProgram.find();
    res.send(list);
  });

  fastify.put(
    "/study-program/:id",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      const updated = await StudyProgram.findByIdAndUpdate(
        req.params.id,
        { name: req.body.name },
        { new: true }
      );
      res.send(updated);
    }
  );

  fastify.delete(
    "/study-program/:id",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      await StudyProgram.findByIdAndDelete(req.params.id);
      res.code(204).send();
    }
  );

  // UNIVERSITY
  fastify.post(
    "/university",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      const { name, speciality } = req.body;
      const existing = await University.findOne({ name });
      if (existing)
        return res.code(400).send({ message: "University already exists" });

      const university = await University.create({ name, speciality });
      res.code(201).send(university);
    }
  );

  fastify.get("/university", async (req, res) => {
    const universities = await University.find().populate("speciality");
    res.send(universities);
  });

  fastify.put(
    "/university/:id",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      const { name, speciality } = req.body;
      const updated = await University.findByIdAndUpdate(
        req.params.id,
        { name, speciality },
        { new: true }
      );
      res.send(updated);
    }
  );

  fastify.delete(
    "/university/:id",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      await University.findByIdAndDelete(req.params.id);
      res.code(204).send();
    }
  );

  // INDUSTRY
  fastify.post(
    "/industry",
    { preHandler: roleAuth(["admin"]), schema: industryDto },
    async (req, res) => {
      const industry = await new Industry({ name: req.body.name }).save();
      res.code(201).send(industry);
    }
  );

  fastify.put(
    "/industry/:id",
    { preHandler: roleAuth(["admin"]), schema: industryDto },
    async (req, res) => {
      const updated = await Industry.findByIdAndUpdate(
        req.params.id,
        { name: req.body.name },
        { new: true }
      );
      res.send(updated);
    }
  );

  fastify.delete(
    "/industry/:id",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      await Industry.findByIdAndDelete(req.params.id);
      res.code(204).send();
    }
  );

  fastify.get("/industry", async (req, res) => {
    const data = await Industry.find();
    res.send(data);
  });

  fastify.get("/industry/search", async (req, res) => {
    const q = (req.query.q || "").trim();

    const filter = q
      ? {
          name: {
            $regex: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
          },
        }
      : {};

    const industries = await Industry.find(filter).limit(10).sort({ name: 1 });
    res.send(industries);
  });

  // SKILL
  fastify.post(
    "/skill",
    { preHandler: roleAuth(["admin"]) /*, schema: skillDto*/ },
    async (req, res) => {
      const raw = (req.body?.name || "").trim();
      if (!raw) return res.code(400).send({ message: "name is required" });

      const normName = normalizeSkillName(raw);

      try {
        const skill = await Skill.create({
          name: raw,
          normName,
          source: "admin",
        });
        return res.code(201).send(skill);
      } catch (e) {
        if (e?.code === 11000) {
          const existing = await Skill.findOne({ normName }).lean();
          return res.code(409).send({
            message: "Skill already exists",
            skill: existing,
          });
        }
        throw e;
      }
    }
  );

  fastify.put(
    "/skill/:id",
    { preHandler: roleAuth(["admin"]) /*, schema: skillDto*/ },
    async (req, res) => {
      const raw = (req.body?.name || "").trim();
      if (!raw) return res.code(400).send({ message: "name is required" });

      const normName = normalizeSkillName(raw);

      try {
        const updated = await Skill.findByIdAndUpdate(
          req.params.id,
          { name: raw, normName },
          { new: true, runValidators: true }
        );
        if (!updated) return res.code(404).send({ message: "Skill not found" });
        return res.send(updated);
      } catch (e) {
        if (e?.code === 11000) {
          const conflict = await Skill.findOne({ normName }).lean();
          return res.code(409).send({
            message: "Another skill with the same name already exists",
            conflictWith: conflict?._id,
          });
        }
        throw e;
      }
    }
  );

  fastify.delete(
    "/skill/:id",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      await Skill.findByIdAndDelete(req.params.id);
      res.code(204).send();
    }
  );

  fastify.get("/skill", async (req, res) => {
    const sort = (req.query.sort || "popular").toString(); // "popular" | "name"
    const order = (req.query.order || "desc").toString();  // "asc" | "desc"
    const limit = Math.min(parseInt(req.query.limit || 0, 10) || 0, 1000); // optional

    let sortObj;
    if (sort === "name") {
      sortObj = { name: order === "asc" ? 1 : -1 };
    } else {
      // popular default
      sortObj = { usageCount: order === "asc" ? 1 : -1, name: 1 };
    }

    const query = Skill.find({}).sort(sortObj);
    if (limit > 0) query.limit(limit);

    const data = await query.lean();
    return res.send(data);
  });

  // SEARCH (prefix; popularity first; limit 10 default)
  fastify.get("/skill/search", async (req, res) => {
    const q = (req.query.q || "").trim();
    const limit = Math.min(parseInt(req.query.limit || 10, 10) || 10, 25);

    if (!q) {
      const top = await Skill.find({})
        .sort({ usageCount: -1, name: 1 })
        .limit(limit)
        .lean();
      return res.send(top);
    }

    const norm = normalizeSkillName(q);
    const esc = norm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp("^" + esc, "i");

    const skills = await Skill.find({
      $or: [{ name: re }, { normName: re }],
    })
      .sort({ usageCount: -1, name: 1 })
      .limit(limit)
      .lean();

    return res.send(skills);
  });

  // PROVINSI
  fastify.post(
    "/provinsi",
    { preHandler: roleAuth(["admin"]), schema: provinsiDto },
    async (req, res) => {
      const prov = await new Provinsi({ name: req.body.name }).save();
      res.code(201).send(prov);
    }
  );

  fastify.put(
    "/provinsi/:id",
    { preHandler: roleAuth(["admin"]), schema: provinsiDto },
    async (req, res) => {
      const updated = await Provinsi.findByIdAndUpdate(
        req.params.id,
        { name: req.body.name },
        { new: true }
      );
      res.send(updated);
    }
  );

  fastify.delete(
    "/provinsi/:id",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      await Provinsi.findByIdAndDelete(req.params.id);
      res.code(204).send();
    }
  );

  fastify.get("/provinsi", async (req, res) => {
    const data = await Provinsi.find();
    res.send(data);
  });

  // KABUPATEN
  fastify.post(
    "/kabupaten",
    { preHandler: roleAuth(["admin"]), schema: kabupatenDto },
    async (req, res) => {
      const kab = await new Kabupaten({
        name: req.body.name,
        provinsi: req.body.provinsi,
      }).save();
      res.code(201).send(kab);
    }
  );

  fastify.put(
    "/kabupaten/:id",
    { preHandler: roleAuth(["admin"]), schema: kabupatenDto },
    async (req, res) => {
      const updated = await Kabupaten.findByIdAndUpdate(
        req.params.id,
        {
          name: req.body.name,
          provinsi: req.body.provinsi,
        },
        { new: true }
      );
      res.send(updated);
    }
  );

  fastify.delete(
    "/kabupaten/:id",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      await Kabupaten.findByIdAndDelete(req.params.id);
      res.code(204).send();
    }
  );

  fastify.get("/kabupaten", async (req, res) => {
    const filter = req.query.provinsi ? { provinsi: req.query.provinsi } : {};
    const data = await Kabupaten.find(filter).populate("provinsi");
    res.send(data);
  });

  // KECAMATAN
  fastify.post(
    "/kecamatan",
    { preHandler: roleAuth(["admin"]), schema: kecamatanDto },
    async (req, res) => {
      const kec = await new Kecamatan({
        name: req.body.name,
        kabupaten: req.body.kabupaten,
      }).save();
      res.code(201).send(kec);
    }
  );

  fastify.put(
    "/kecamatan/:id",
    { preHandler: roleAuth(["admin"]), schema: kecamatanDto },
    async (req, res) => {
      const updated = await Kecamatan.findByIdAndUpdate(
        req.params.id,
        {
          name: req.body.name,
          kabupaten: req.body.kabupaten,
        },
        { new: true }
      );
      res.send(updated);
    }
  );

  fastify.get("/kecamatan", async (req, res) => {
    const filter = req.query.kabupaten
      ? { kabupaten: req.query.kabupaten }
      : {};
    const data = await Kecamatan.find(filter).populate("kabupaten");
    res.send(data);
  });

  fastify.delete(
    "/kecamatan/:id",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      await Kecamatan.findByIdAndDelete(req.params.id);
      res.code(204).send();
    }
  );

  fastify.get(
    "/sync-location/new",
    { preHandler: roleAuth(["admin"]) },
    async (req, res) => {
      res.sse({
        event: "start",
        data: JSON.stringify({ message: "Starting location sync…" }),
      });

      const send = (event, payload) =>
        res.sse({ event, data: JSON.stringify(payload) });

      try {
        const provinsiRes = await axios.get(
          "https://ibnux.github.io/data-indonesia/provinsi.json"
        );
        const provinsiList = provinsiRes.data || [];

        const added = { provinsi: 0, kabupaten: 0, kecamatan: 0 };
        const totals = {
          provinsi: provinsiList.length,
          kabupaten: 0,
          kecamatan: 0,
        };
        const done = { provinsi: 0, kabupaten: 0, kecamatan: 0 };

        send("totals", { totals });

        for (const prov of provinsiList) {
          send("status", { level: "provinsi", name: prov.nama });

          let provDoc = await Provinsi.findOne({ name: prov.nama });
          if (!provDoc) {
            try {
              provDoc = await Provinsi.create({ name: prov.nama });
              added.provinsi++;
            } catch {}
          }
          done.provinsi++;
          send("progress", { done, totals, added });

          const kabRes = await axios.get(
            `https://ibnux.github.io/data-indonesia/kabupaten/${prov.id}.json`
          );
          const kabList = kabRes.data || [];
          totals.kabupaten += kabList.length;
          send("totals", { totals });

          for (const kab of kabList) {
            send("status", { level: "kabupaten", name: kab.nama });

            let kabDoc = await Kabupaten.findOne({ name: kab.nama });
            if (!kabDoc) {
              try {
                kabDoc = await Kabupaten.create({
                  name: kab.nama,
                  provinsi: provDoc._id,
                });
                added.kabupaten++;
              } catch {}
            }
            done.kabupaten++;
            send("progress", { done, totals, added });

            const kecRes = await axios.get(
              `https://ibnux.github.io/data-indonesia/kecamatan/${kab.id}.json`
            );
            const kecList = kecRes.data || [];
            totals.kecamatan += kecList.length;
            send("totals", { totals });

            for (const kec of kecList) {
              send("status", { level: "kecamatan", name: kec.nama });

              let kecDoc = await Kecamatan.findOne({ name: kec.nama });
              if (!kecDoc) {
                try {
                  await Kecamatan.create({
                    name: kec.nama,
                    kabupaten: kabDoc._id,
                  });
                  added.kecamatan++;
                } catch {}
              }
              done.kecamatan++;
              send("progress", { done, totals, added });
            }
          }
        }

        send("done", { message: "Sync complete", added, totals, done });
        res.sseContext.source.end();
      } catch (err) {
        send("error", { message: err.message || "Sync failed" });
        res.sseContext.source.end();
      }
    }
  );

  fastify.get("/users", { preHandler: roleAuth(["admin"]) }, async (req, res) => {
  const { page, limit, skip } = getPaging(req);
  const q = (req.query.q || "").trim();
  const isActive = toBool(req.query.isActive);
  const isVerified = toBool(req.query.isVerified);

  const $and = [{ role: "user" }];
  if (q) {
    const r = regexOrNull(q);
    $and.push({ $or: [{ fullName: r }, { email: r }] });
  }
  if (isActive !== undefined) $and.push({ isActive });
  if (isVerified !== undefined) $and.push({ isVerified });

  const filter = $and.length ? { $and } : {};
  const [items, total] = await Promise.all([
    User.find(filter)
      .select("fullName email isVerified isActive createdAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  res.send({ items, total, page, pages: Math.ceil(total / limit) });
});

fastify.patch("/users/:id/activate", { preHandler: roleAuth(["admin"]) }, async (req, res) => {
  const doc = await User.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true })
    .select("fullName email isActive");
  if (!doc) return res.code(404).send({ message: "User not found" });
  res.send({ ok: true, user: doc });
});

fastify.patch("/users/:id/deactivate", { preHandler: roleAuth(["admin"]) }, async (req, res) => {
  const doc = await User.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true })
    .select("fullName email isActive");
  if (!doc) return res.code(404).send({ message: "User not found" });
  res.send({ ok: true, user: doc });
});

fastify.delete("/users/:id", { preHandler: roleAuth(["admin"]) }, async (req, res) => {
  const doc = await User.findByIdAndDelete(req.params.id);
  if (!doc) return res.code(404).send({ message: "User not found" });
  res.send({ ok: true });
});

// ---------- COMPANIES ----------
fastify.get("/companies", { preHandler: roleAuth(["admin"]) }, async (req, res) => {
  const { page, limit, skip } = getPaging(req);
  const q = (req.query.q || "").trim();
  const isActive = toBool(req.query.isActive);
  const isVerified = toBool(req.query.isVerified);

  const $and = [{ role: "company" }];
  if (q) {
    const r = regexOrNull(q);
    $and.push({ $or: [{ companyName: r }, { email: r }] });
  }
  if (isActive !== undefined) $and.push({ isActive });
  if (isVerified !== undefined) $and.push({ isVerified });

  const filter = $and.length ? { $and } : {};
  const [items, total] = await Promise.all([
    Company.find(filter)
      .select("companyName email isVerified isActive createdAt rating.average rating.count")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Company.countDocuments(filter),
  ]);

  res.send({ items, total, page, pages: Math.ceil(total / limit) });
});

fastify.patch("/companies/:id/activate", { preHandler: roleAuth(["admin"]) }, async (req, res) => {
  const doc = await Company.findByIdAndUpdate(req.params.id, { isActive: true }, { new: true })
    .select("companyName email isActive");
  if (!doc) return res.code(404).send({ message: "Company not found" });
  res.send({ ok: true, company: doc });
});

fastify.patch("/companies/:id/deactivate", { preHandler: roleAuth(["admin"]) }, async (req, res) => {
  const doc = await Company.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true })
    .select("companyName email isActive");
  if (!doc) return res.code(404).send({ message: "Company not found" });
  res.send({ ok: true, company: doc });
});

fastify.delete("/companies/:id", { preHandler: roleAuth(["admin"]) }, async (req, res) => {
  const doc = await Company.findByIdAndDelete(req.params.id);
  if (!doc) return res.code(404).send({ message: "Company not found" });
  res.send({ ok: true });
});

// ---------- REVIEWS ----------
fastify.get("/reviews", { preHandler: roleAuth(["admin"]) }, async (req, res) => {
  const { page, limit, skip } = getPaging(req);
  const q = (req.query.q || "").trim();
  const minRating = parseInt(req.query.minRating || "0", 10);

  const filter = {};
  if (minRating > 0) filter.rating = { $gte: minRating };

  // 1) Load with correct populate (reviewer/reviewee are polymorphic via refPath)
  // We DON'T try to populate `user` or `company`—those paths don't exist.
  const baseQuery = Review.find(filter)
    .populate({ path: "reviewer", select: "fullName companyName email" })
    .populate({ path: "reviewee", select: "fullName companyName email" })
    .populate({ path: "application", select: "job company user" })
    .sort({ createdAt: -1 })
    .lean();

  let docs;
  let total;

  if (q) {
    // 2) If searching, fetch all, filter in memory, then paginate slice
    const all = await baseQuery; // no skip/limit
    const r = new RegExp(escRegex(q), "i");
    const filtered = all.filter((x) =>
      r.test(x?.comment || "") ||
      r.test(x?.reviewer?.fullName || "") ||
      r.test(x?.reviewer?.companyName || "") ||
      r.test(x?.reviewer?.email || "") ||
      r.test(x?.reviewee?.fullName || "") ||
      r.test(x?.reviewee?.companyName || "") ||
      r.test(x?.reviewee?.email || "")
    );
    total = filtered.length;
    docs = filtered.slice(skip, skip + limit);
  } else {
    // 3) No search → normal paginated query
    [docs, total] = await Promise.all([
      baseQuery.skip(skip).limit(limit),
      Review.countDocuments(filter),
    ]);
  }

  // 4) Shape for the UI
  const items = docs.map((d) => ({
    _id: d._id,
    rating: d.rating,
    comment: d.comment || "",
    createdAt: d.createdAt,
    reviewer: {
      _id: d.reviewer?._id || null,
      type: d.reviewerType, // "User" | "Company"
      name: d.reviewerType === "User" ? d.reviewer?.fullName : d.reviewer?.companyName,
      email: d.reviewer?.email || null,
    },
    reviewee: {
      _id: d.reviewee?._id || null,
      type: d.revieweeType, // "User" | "Company"
      name: d.revieweeType === "User" ? d.reviewee?.fullName : d.reviewee?.companyName,
      email: d.reviewee?.email || null,
    },
    application: d.application?._id || null,
  }));

  res.send({
    items,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  });
});

fastify.delete("/reviews/:id", { preHandler: roleAuth(["admin"]) }, async (req, res) => {
  const doc = await Review.findByIdAndDelete(req.params.id);
  if (!doc) return res.code(404).send({ message: "Review not found" });
  res.send({ ok: true });
});
}

module.exports = adminRoutes;
