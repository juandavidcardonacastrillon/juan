const express = require('express');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const port = 3000;

// Configuración de CORS
app.use(cors());
app.use(express.json());

// Configuración para servir archivos estáticos
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configuración de multer para subir imágenes
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, 'uploads'))
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Configuración de la base de datos
const db = new sqlite3.Database('./properties.db', {
    // Configuración de seguridad para producción
    mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
    vfs: 'unix-excl'
}, (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Conectado a la base de datos SQLite.');

    // Crear tabla de propiedades si no existe
    db.run(`CREATE TABLE IF NOT EXISTS properties (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        price TEXT,
        currency TEXT DEFAULT 'COP',
        address TEXT,
        details TEXT,
        image_url TEXT,
        location TEXT,
        latitude TEXT,
        longitude TEXT,
        beds INTEGER DEFAULT 3,
        baths INTEGER DEFAULT 4,
        living_area TEXT,
        lot_size TEXT,
        status TEXT DEFAULT 'FOR SALE',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        pool TEXT DEFAULT 'No',
        jacuzzi TEXT DEFAULT 'No',
        turco TEXT DEFAULT 'No',
        sauna TEXT DEFAULT 'No',
        air_conditioning TEXT DEFAULT 'No',
        parking TEXT DEFAULT 'No',
        heat_type TEXT,
        property_type TEXT,
        year_built INTEGER,
        architecture_style TEXT,
        zoning TEXT,
        mls_id TEXT,
        view_description TEXT,
        luxury_finishes TEXT,
        entertainment_areas TEXT,
        security_features TEXT,
        tech_sustainability TEXT,
        neighborhood_exclusivity TEXT,
        roi_analysis TEXT
    )`, (err) => {
        if (err) {
            console.error('Error al crear la tabla:', err.message);
        } else {
            console.log('Tabla creada correctamente');
            // Crear propiedades de ejemplo
            createSampleProperties();
        }
    });
});

// Crear carpeta de uploads si no existe
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir);
}

// Función auxiliar para borrar un archivo
function deleteFile(filePath) {
    const fullPath = path.join(__dirname, filePath);
    if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
    }
}

// Rutas API
app.post('/api/properties', upload.array('images', 30), (req, res) => {
    console.log('Datos recibidos:', req.body);
    console.log('Coordenadas:', { lat: req.body.latitude, lng: req.body.longitude });
    const { 
        title, address, details, price, currency, location, 
        beds, baths, living_area, lot_size,
        pool, jacuzzi, turco, sauna, air_conditioning, year_built,
        property_type, architecture_style, status,
        parking, heat_type, zoning, mls_id,
        view_description, latitude, longitude
    } = req.body;

    // La primera imagen será la imagen principal
    const mainImageUrl = req.files && req.files.length > 0 ? `/uploads/${req.files[0].filename}` : null;

    const sql = `INSERT INTO properties (
        title, address, details, price, currency, image_url, location,
        beds, baths, living_area, lot_size,
        pool, jacuzzi, turco, sauna, air_conditioning, year_built,
        property_type, architecture_style, status,
        parking, heat_type, zoning, mls_id,
        view_description, latitude, longitude
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    
    db.run(sql, [
        title, address, details, price, currency, mainImageUrl, location,
        beds, baths, living_area, lot_size,
        pool, jacuzzi, turco, sauna, air_conditioning, year_built,
        property_type, architecture_style, status,
        parking, heat_type, zoning, mls_id,
        view_description, latitude, longitude
    ], function(err) {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }

        const propertyId = this.lastID;

        // Insertar las imágenes adicionales
        if (req.files && req.files.length > 1) {
            const values = req.files.slice(1).map(file => ({
                property_id: propertyId,
                image_url: `/uploads/${file.filename}`
            }));

            const insertImagesSql = `INSERT INTO property_images (property_id, image_url) VALUES (?, ?)`;
            values.forEach(value => {
                db.run(insertImagesSql, [value.property_id, value.image_url]);
            });
        }

        res.json({
            id: propertyId,
            message: "Propiedad agregada exitosamente"
        });
    });
});

// Ruta para obtener todas las propiedades ordenadas por fecha de creación
app.get('/api/properties', (req, res) => {
    const sql = "SELECT * FROM properties ORDER BY created_at DESC";
    db.all(sql, [], (err, rows) => {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Ruta para obtener las últimas propiedades (para el slider de la página principal)
app.get('/api/latest-properties', (req, res) => {
    const sql = "SELECT * FROM properties ORDER BY created_at DESC LIMIT 5";
    db.all(sql, [], (err, rows) => {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Ruta para eliminar una propiedad
app.delete('/api/properties/:id', (req, res) => {
    const propertyId = req.params.id;

    // Primero obtener todas las imágenes asociadas
    db.all('SELECT image_url FROM property_images WHERE property_id = ?', [propertyId], (err, propertyImages) => {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }

        // Eliminar las imágenes del sistema de archivos
        propertyImages.forEach(image => {
            const imagePath = image.image_url.replace('/uploads/', 'uploads/');
            deleteFile(imagePath);
        });

        // Obtener la imagen principal
        db.get('SELECT image_url FROM properties WHERE id = ?', [propertyId], (err, property) => {
            if (err) {
                res.status(400).json({ error: err.message });
                return;
            }

            if (!property) {
                res.status(404).json({ error: "Propiedad no encontrada" });
                return;
            }

            // Borrar la imagen principal
            if (property.image_url) {
                deleteFile(property.image_url);
            }

            // Borrar registros de imágenes de la base de datos
            db.run('DELETE FROM property_images WHERE property_id = ?', [propertyId], (err) => {
                if (err) {
                    res.status(400).json({ error: err.message });
                    return;
                }

                // Finalmente, borrar la propiedad
                db.run('DELETE FROM properties WHERE id = ?', [propertyId], (err) => {
                    if (err) {
                        res.status(400).json({ error: err.message });
                        return;
                    }
                    res.json({ message: "Propiedad y todas sus imágenes eliminadas exitosamente" });
                });
            });
        });
    });
});

// Nueva ruta para actualizar una propiedad
app.put('/api/properties/:id', upload.array('images', 30), (req, res) => {
    const propertyId = req.params.id;
    const { 
        title, address, details, price, currency, location,
        beds, baths, living_area, lot_size,
        pool, jacuzzi, turco, sauna, air_conditioning, year_built,
        property_type, architecture_style, status,
        parking, heat_type, zoning, mls_id,
        view_description, latitude, longitude
    } = req.body;

    let mainImageUrl = null;
    if (req.files && req.files.length > 0) {
        mainImageUrl = `/uploads/${req.files[0].filename}`;
    }

    const updateFields = [
        title, address, details, price, currency, location,
        beds, baths, living_area, lot_size,
        pool, jacuzzi, turco, sauna, air_conditioning, year_built,
        property_type, architecture_style, status,
        parking, heat_type, zoning, mls_id,
        view_description, latitude, longitude
    ];

    let sql = `UPDATE properties SET 
        title = ?, address = ?, details = ?, price = ?, currency = ?, location = ?,
        beds = ?, baths = ?, living_area = ?, lot_size = ?,
        pool = ?, jacuzzi = ?, turco = ?, sauna = ?, air_conditioning = ?, year_built = ?,
        property_type = ?, architecture_style = ?, status = ?,
        parking = ?, heat_type = ?, zoning = ?, mls_id = ?,
        view_description = ?, latitude = ?, longitude = ?`;

    if (mainImageUrl) {
        sql += `, image_url = ?`;
        updateFields.push(mainImageUrl);
    }

    sql += ` WHERE id = ?`;
    updateFields.push(propertyId);

    db.run(sql, updateFields, function(err) {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }
        res.json({ message: "Propiedad actualizada exitosamente" });
    });
});

// Ruta para obtener una propiedad específica por ID
app.get('/api/properties/:id', (req, res) => {
    const propertyId = req.params.id;
    console.log('Buscando propiedad con ID:', propertyId);
    
    // Obtener la propiedad principal
    db.get('SELECT * FROM properties WHERE id = ?', [propertyId], (err, property) => {
        if (err) {
            console.error('Error al obtener propiedad:', err);
            res.status(400).json({ error: err.message });
            return;
        }
        console.log('Datos de la propiedad:', property);
        if (!property) {
            res.status(404).json({ error: "Propiedad no encontrada" });
            return;
        }

        // Obtener las imágenes adicionales
        db.all('SELECT image_url FROM property_images WHERE property_id = ?', [propertyId], (err, images) => {
            if (err) {
                res.status(400).json({ error: err.message });
                return;
            }

            // Combinar la imagen principal con las imágenes adicionales
            property.images = [property.image_url, ...images.map(img => img.image_url)];
            res.json(property);
        });
    });
});

// Ruta para obtener la propiedad más reciente
app.get('/api/latest-property', (req, res) => {
    const sql = "SELECT * FROM properties ORDER BY id DESC LIMIT 1";
    db.get(sql, [], (err, row) => {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }
        res.json(row || {});
    });
});

// Ruta para obtener propiedades por ubicación
app.get('/api/properties/location/:location', (req, res) => {
    const location = req.params.location;
    const sql = "SELECT * FROM properties WHERE location = ? ORDER BY created_at DESC";
    
    db.all(sql, [location], (err, rows) => {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }
        res.json(rows);
    });
});

// Endpoint para búsqueda inteligente
app.get('/api/search', (req, res) => {
    const query = req.query.q?.toLowerCase() || '';
    const sql = `
        SELECT * FROM properties 
        WHERE LOWER(title) LIKE ? 
        OR LOWER(address) LIKE ? 
        OR LOWER(details) LIKE ? 
        OR LOWER(location) LIKE ? 
        OR LOWER(price) LIKE ? 
        OR LOWER(property_type) LIKE ? 
        OR LOWER(architecture_style) LIKE ? 
        OR LOWER(view_description) LIKE ?
    `;
    
    const searchTerm = `%${query}%`;
    const params = Array(8).fill(searchTerm); // 8 es el número de campos que estamos buscando
    
    db.all(sql, params, (err, rows) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }

        // Agrupar resultados por tipo
        const results = {
            properties: [],
            locations: [],
            priceRanges: [],
            suggestions: []
        };

        rows.forEach(row => {
            // Agregar a propiedades si coincide con título o detalles
            if (row.title.toLowerCase().includes(query) || 
                row.details.toLowerCase().includes(query)) {
                results.properties.push(row);
            }

            // Agregar a ubicaciones si coincide con location o address
            if (row.location.toLowerCase().includes(query) || 
                row.address.toLowerCase().includes(query)) {
                if (!results.locations.includes(row.location)) {
                    results.locations.push(row.location);
                }
            }

            // Agregar a rangos de precio si coincide con el precio
            if (row.price.toLowerCase().includes(query)) {
                if (!results.priceRanges.includes(row.price)) {
                    results.priceRanges.push(row.price);
                }
            }
        });

        // Generar sugerencias inteligentes
        const suggestions = new Set();
        rows.forEach(row => {
            // Agregar palabras clave de los detalles
            row.details.split(' ').forEach(word => {
                if (word.toLowerCase().includes(query) && word.length > 3) {
                    suggestions.add(word);
                }
            });
            // Agregar características específicas
            if (row.architecture_style && row.architecture_style.toLowerCase().includes(query)) {
                suggestions.add(row.architecture_style);
            }
            if (row.view_description) {
                row.view_description.split(',').forEach(view => {
                    if (view.trim().toLowerCase().includes(query)) {
                        suggestions.add(view.trim());
                    }
                });
            }
        });
        results.suggestions = Array.from(suggestions);

        res.json(results);
    });
});

// Endpoint para obtener detalles de una propiedad específica
app.get('/api/property/:id', (req, res) => {
    const id = req.params.id;
    const sql = 'SELECT * FROM properties WHERE id = ?';
    
    db.get(sql, [id], (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }
        if (!row) {
            res.status(404).json({ error: 'Property not found' });
            return;
        }
        res.json(row);
    });
});

// Ruta temporal para resetear todas las propiedades
app.post('/api/reset-properties', (req, res) => {
    // 1. Obtener todas las imágenes
    db.all('SELECT p.image_url as main_image, pi.image_url as additional_image FROM properties p LEFT JOIN property_images pi ON p.id = pi.property_id', [], (err, images) => {
        if (err) {
            res.status(400).json({ error: err.message });
            return;
        }

        // 2. Borrar todos los archivos de imágenes
        images.forEach(img => {
            if (img.main_image) deleteFile(img.main_image);
            if (img.additional_image) deleteFile(img.additional_image);
        });

        // 3. Borrar todos los registros de la base de datos
        db.serialize(() => {
            // Borrar imágenes adicionales
            db.run('DELETE FROM property_images', [], (err) => {
                if (err) {
                    res.status(400).json({ error: err.message });
                    return;
                }

                // Borrar propiedades
                db.run('DELETE FROM properties', [], (err) => {
                    if (err) {
                        res.status(400).json({ error: err.message });
                        return;
                    }

                    // Resetear los autoincrement
                    db.run('DELETE FROM sqlite_sequence WHERE name IN (?, ?)', ['properties', 'property_images'], (err) => {
                        if (err) {
                            res.status(400).json({ error: err.message });
                            return;
                        }

                        res.json({ message: "Todas las propiedades y sus imágenes han sido eliminadas exitosamente" });
                    });
                });
            });
        });
    });
});

// Función para crear propiedades de prueba
function createSampleProperties() {
    const properties = [
        {
            title: "Villa Moderna en Ciudad Jardín",
            price: "$980,000",
            address: "Ciudad Jardín, Cali",
            details: "Espectacular villa moderna con acabados de lujo",
            image_url: "/uploads/sample-cali-1.jpg",
            location: "cali"
        },
        {
            title: "Mansión en Santa Rita",
            price: "$1,200,000",
            address: "Santa Rita, Cali",
            details: "Mansión exclusiva con vista a los Farallones",
            image_url: "/uploads/sample-cali-2.jpg",
            location: "cali"
        },
        {
            title: "Casa Campestre en Armenia",
            price: "$750,000",
            address: "Circasia, Armenia",
            details: "Hermosa casa con vista al valle",
            image_url: "/uploads/sample-eje-1.jpg",
            location: "eje-cafetero"
        },
        {
            title: "Finca Cafetera en Pereira",
            price: "$890,000",
            address: "Vía Armenia, Pereira",
            details: "Finca productora de café con casa principal renovada",
            image_url: "/uploads/sample-eje-2.jpg",
            location: "eje-cafetero"
        },
        {
            title: "Condominio en Cerritos",
            price: "$680,000",
            address: "Cerritos, Pereira",
            details: "Condominio exclusivo con club house",
            image_url: "/uploads/sample-cerritos-1.jpg",
            location: "cerritos-pereira"
        },
        {
            title: "Casa Campestre en Cerritos",
            price: "$920,000",
            address: "Cerritos, Pereira",
            details: "Casa campestre con diseño moderno",
            image_url: "/uploads/sample-cerritos-2.jpg",
            location: "cerritos-pereira"
        }
    ];

    // Copiar imágenes de muestra
    const sampleImages = [
        'sample-cali-1.jpg',
        'sample-cali-2.jpg',
        'sample-eje-1.jpg',
        'sample-eje-2.jpg',
        'sample-cerritos-1.jpg',
        'sample-cerritos-2.jpg'
    ];

    // Copiar las imágenes de assets/images a uploads
    sampleImages.forEach(image => {
        const sourcePath = path.join(__dirname, 'assets', 'images', image);
        const destPath = path.join(__dirname, 'uploads', image);
        if (fs.existsSync(sourcePath)) {
            fs.copyFileSync(sourcePath, destPath);
        }
    });

    // Insertar las propiedades
    const sql = `INSERT INTO properties (
        title, price, address, details, image_url, location
    ) VALUES (?, ?, ?, ?, ?, ?)`;

    properties.forEach(prop => {
        db.run(sql, [
            prop.title,
            prop.price,
            prop.address,
            prop.details,
            prop.image_url,
            prop.location
        ]);
    });
}

// Ruta para crear propiedades de prueba
app.post('/api/create-sample-properties', (req, res) => {
    createSampleProperties();
    res.json({ message: "Propiedades de prueba creadas exitosamente" });
});

// Ruta principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'pagina principal.html'));
});

// Otras rutas específicas para las páginas HTML
app.get('/cali', (req, res) => {
    res.sendFile(path.join(__dirname, 'Cali.html'));
});

app.get('/nuestras-propiedades', (req, res) => {
    res.sendFile(path.join(__dirname, 'nuestras propiedades.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/property-detail', (req, res) => {
    res.sendFile(path.join(__dirname, 'property-detail.html'));
});

app.get('/eje-cafetero', (req, res) => {
    res.sendFile(path.join(__dirname, 'eje-cafetero.html'));
});

app.get('/cerritos-pereira', (req, res) => {
    res.sendFile(path.join(__dirname, 'cerritos-pereira.html'));
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Servidor corriendo en http://0.0.0.0:${port}`);
});
