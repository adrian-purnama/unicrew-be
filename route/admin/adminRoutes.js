const roleAuth = require("../../helper/roleAuth");

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

async function adminRoutes(fastify, options) {
    fastify.post("/study-program", { preHandler: roleAuth(["admin"]) }, async (req, res) => {
        const program = await new StudyProgram({ name: req.body.name }).save();
        res.code(201).send(program);
    });

    fastify.get("/study-program", async (req, res) => {
        const list = await StudyProgram.find();
        res.send(list);
    });

    fastify.put("/study-program/:id", { preHandler: roleAuth(["admin"]) }, async (req, res) => {
        const updated = await StudyProgram.findByIdAndUpdate(
            req.params.id,
            { name: req.body.name },
            { new: true }
        );
        res.send(updated);
    });

    fastify.delete("/study-program/:id", { preHandler: roleAuth(["admin"]) }, async (req, res) => {
        await StudyProgram.findByIdAndDelete(req.params.id);
        res.code(204).send();
    });

    // UNIVERSITY
    fastify.post("/university", { preHandler: roleAuth(["admin"]) }, async (req, res) => {
        const { name, speciality } = req.body;
        const existing = await University.findOne({ name });
        if (existing) return res.code(400).send({ message: "University already exists" });

        const university = await University.create({ name, speciality });
        res.code(201).send(university);
    });

    fastify.get("/university", async (req, res) => {
        const universities = await University.find().populate("speciality");
        res.send(universities);
    });

    fastify.put("/university/:id", { preHandler: roleAuth(["admin"]) }, async (req, res) => {
        const { name, speciality } = req.body;
        const updated = await University.findByIdAndUpdate(
            req.params.id,
            { name, speciality },
            { new: true }
        );
        res.send(updated);
    });

    fastify.delete("/university/:id", { preHandler: roleAuth(["admin"]) }, async (req, res) => {
        await University.findByIdAndDelete(req.params.id);
        res.code(204).send();
    });

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

    fastify.delete("/industry/:id", { preHandler: roleAuth(["admin"]) }, async (req, res) => {
        await Industry.findByIdAndDelete(req.params.id);
        res.code(204).send();
    });

    fastify.get("/industry", async (req, res) => {
        const data = await Industry.find();
        res.send(data);
    });

    fastify.get("/industry/search", async (req, res) => {
        const q = (req.query.q || "").trim();

        const filter = q
            ? { name: { $regex: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") } }
            : {};

        const industries = await Industry.find(filter).limit(10).sort({ name: 1 });
        res.send(industries);
    });

    // SKILL
    fastify.post(
        "/skill",
        { preHandler: roleAuth(["admin"]), schema: skillDto },
        async (req, res) => {
            const skill = await new Skill({ name: req.body.name }).save();
            res.code(201).send(skill);
        }
    );

    fastify.put(
        "/skill/:id",
        { preHandler: roleAuth(["admin"]), schema: skillDto },
        async (req, res) => {
            const updated = await Skill.findByIdAndUpdate(
                req.params.id,
                { name: req.body.name },
                { new: true }
            );
            res.send(updated);
        }
    );

    fastify.delete("/skill/:id", { preHandler: roleAuth(["admin"]) }, async (req, res) => {
        await Skill.findByIdAndDelete(req.params.id);
        res.code(204).send();
    });

    fastify.get("/skill", async (req, res) => {
        const data = await Skill.find();
        res.send(data);
    });

    fastify.get("/skill/search", async (req, res) => {
        const q = (req.query.q || "").trim();

        const filter = q
            ? { name: { $regex: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") } } // escape special chars
            : {};

        const skills = await Skill.find(filter).limit(10).sort({ name: 1 });
        res.send(skills);
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

    fastify.delete("/provinsi/:id", { preHandler: roleAuth(["admin"]) }, async (req, res) => {
        await Provinsi.findByIdAndDelete(req.params.id);
        res.code(204).send();
    });

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

    fastify.delete("/kabupaten/:id", { preHandler: roleAuth(["admin"]) }, async (req, res) => {
        await Kabupaten.findByIdAndDelete(req.params.id);
        res.code(204).send();
    });

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
        const filter = req.query.kabupaten ? { kabupaten: req.query.kabupaten } : {};
        const data = await Kecamatan.find(filter).populate("kabupaten");
        res.send(data);
    });

    fastify.delete("/kecamatan/:id", { preHandler: roleAuth(["admin"]) }, async (req, res) => {
        await Kecamatan.findByIdAndDelete(req.params.id);
        res.code(204).send();
    });

    // KELURAHAN
    //   fastify.post('/kelurahan', { preHandler: roleAuth(['admin']), schema: kelurahanDto }, async (req, res) => {
    //     const kel = await new Kelurahan({ name: req.body.name, kecamatan: req.body.kecamatan }).save();
    //     res.code(201).send(kel);
    //   });

    //   fastify.put('/kelurahan/:id', { preHandler: roleAuth(['admin']), schema: kelurahanDto }, async (req, res) => {
    //   const updated = await Kelurahan.findByIdAndUpdate(req.params.id, {
    //     name: req.body.name,
    //     kecamatan: req.body.kecamatan
    //   }, { new: true });
    //   res.send(updated);
    // });

    // fastify.delete('/kelurahan/:id', { preHandler: roleAuth(['admin']) }, async (req, res) => {
    //   await Kelurahan.findByIdAndDelete(req.params.id);
    //   res.code(204).send();
    // });

    // fastify.get('/kelurahan', { preHandler: roleAuth(['admin']) }, async (req, res) => {
    //   const filter = req.query.kecamatan ? { kecamatan: req.query.kecamatan } : {};
    //   const data = await Kelurahan.find(filter).populate('kecamatan');
    //   res.send(data);
    // });

    fastify.get("/sync-location", { preHandler: roleAuth(["admin"]) }, async (req, res) => {
        try {
            const provinsiRes = await axios.get(
                "https://ibnux.github.io/data-indonesia/provinsi.json"
            );
            const provinsiList = provinsiRes.data;

            let added = {
                provinsi: 0,
                kabupaten: 0,
                kecamatan: 0,
            };

            for (const prov of provinsiList) {
                console.log(`🔁 Processing provinsi: ${prov.nama}`);
                let provDoc = await Provinsi.findOne({ name: prov.nama });
                if (!provDoc) {
                    try {
                        provDoc = await Provinsi.create({ name: prov.nama });
                        added.provinsi++;
                        console.log(`✅ Added provinsi: ${prov.nama}`);
                    } catch (err) {
                        console.warn(`⚠️ Skipped duplicate provinsi: ${prov.nama}`);
                    }
                }

                const kabRes = await axios.get(
                    `https://ibnux.github.io/data-indonesia/kabupaten/${prov.id}.json`
                );
                const kabList = kabRes.data;

                for (const kab of kabList) {
                    console.log(`   🔁 Processing kabupaten: ${kab.nama}`);
                    let kabDoc = await Kabupaten.findOne({ name: kab.nama });
                    if (!kabDoc) {
                        try {
                            kabDoc = await Kabupaten.create({
                                name: kab.nama,
                                provinsi: provDoc._id,
                            });
                            added.kabupaten++;
                            console.log(`   ✅ Added kabupaten: ${kab.nama}`);
                        } catch (err) {
                            console.warn(`   ⚠️ Skipped duplicate kabupaten: ${kab.nama}`);
                        }
                    }

                    const kecRes = await axios.get(
                        `https://ibnux.github.io/data-indonesia/kecamatan/${kab.id}.json`
                    );
                    const kecList = kecRes.data;

                    for (const kec of kecList) {
                        console.log(`      🔁 Processing kecamatan: ${kec.nama}`);
                        let kecDoc = await Kecamatan.findOne({ name: kec.nama });
                        if (!kecDoc) {
                            try {
                                kecDoc = await Kecamatan.create({
                                    name: kec.nama,
                                    kabupaten: kabDoc._id,
                                });
                                added.kecamatan++;
                                console.log(`      ✅ Added kecamatan: ${kec.nama}`);
                            } catch (err) {
                                console.warn(`      ⚠️ Skipped duplicate kecamatan: ${kec.nama}`);
                            }
                        }
                    }
                }
            }

            return res.send({ message: "✅ Sync complete", added });
        } catch (err) {
            console.error("❌ Sync failed:", err);
            return res.code(500).send({ message: "❌ Sync failed", error: err.message });
        }
    });
}

module.exports = adminRoutes;
