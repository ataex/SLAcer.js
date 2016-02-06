/**
* @class   Viewer3d
* @extends JSClass
*/
var Viewer3d = JSClass(
{
    // defaults settings.
    defaults: {
        view: 'default',
        size: {
            width : 800,
            height: 600
        },
        buildVolume: {
            size: {
                x: 200,
                y: 200,
                z: 200
            },
            enabled: true,
            color  : 0xffa500,
            alpha  : 0.1
        },
        camera: {
            fov   : 75,
            aspect: 'auto',
            near  : 1,
            far   : 10000
        },
        renderer: {
            antialias: true,
            color    : 0x111111
        },
        shadowMap: {
            enabled: true,
            type   : THREE.BasicShadowMap
        },
        lights: {
            ambient: {
                enabled: true,
                color  : 0x404040
            },
            directional1: {
                enabled : true,
                color   : 0xffffff,
                alpha   : 0.6,
                position: 'auto' // front/top/left
            },
            directional2: {
                enabled : true,
                color   : 0xffffff,
                alpha   : 0.1,
                position: 'auto' // front/top/right
            }
        },
        floor: {
            enabled: true,
            color  : 0x222222,
            margin : 10
        },
        grid: {
            enabled: true,
            size1  : 10,
            size2  : 100,
            color1 : 0x444444,
            color2 : 0x333333
        },
        axes: {
            enabled: true
        },
        materials: {
            default: {
                material: THREE.MeshLambertMaterial,
                settings: {
                    color: 'random'
                }
            }
        },
        colors: {
            selected: 0xff0000
        }
    },

    // current settings
    settings: {},

    // 3D elements
    elements: {},

    // Built in elements
    builtInElements: [
        'center',
        'ambientLight',
        'directionalLight1',
        'directionalLight2',
        'floor',
        'grid',
        'axes',
        'buildVolume'
    ],

    // public events
    onMeshAdded   : function(mesh) {},
    onMeshRemoved : function(uuid) {},
    onMeshSelected: function(mesh, selected) {},

    /**
    * Class constructor.
    *
    * @constructor
    */
    create: function(settings) {
        // self alias
        var self = this;

        // merge user and defaults settings
        var settings  = _.defaultsDeep(settings || {}, self.defaults);
        self.settings = settings;

        // auto set aspect
        if (settings.camera.aspect == 'auto') {
            settings.camera.aspect = settings.size.width / settings.size.height;
        }

        // create scene
        self.scene = new THREE.Scene();

        // create camera
        self.camera = new THREE.PerspectiveCamera(
            settings.camera.fov,
            settings.camera.aspect,
            settings.camera.near,
            settings.camera.far
        );

        // set camera orbit around Z axis
        self.camera.up = new THREE.Vector3(0, 0, 1);

        // create renderer
        self.renderer = new THREE.WebGLRenderer(settings.renderer);

        // set renderer size and background color
        self.renderer.setSize(settings.size.width, settings.size.height);
        self.renderer.setClearColor(settings.renderer.color);

        // enable/disable/configure shadow map
        self.renderer.shadowMap = _.assign(
            self.renderer.shadowMap, settings.shadowMap
        );

        // render dom element alias
        self.canvas = self.renderer.domElement;
        self.canvas.addEventListener('contextmenu', function(e) {
            e.stopPropagation();
        });

        // set renderer controls
        self.controls = new THREE.OrbitControls(self.camera, self.canvas);
        self.controls.addEventListener('change', function() {
            self.render();
        });

        // dom events (mouse)
        self.events = new THREEx.DomEvents(self.camera, self.canvas);

        // current action
        self.keyboardActionEnabled = true;
        self.keyboardAction = {
            target   : 'position',
            axis     : 'x',
            unit     : 1,
            operation: '+'
        };

        // public callback
        self.onKeyboardActionEnabled  = function(action) {};
        self.onKeyboardActionDisabled = function(action) {};
        self.onKeyboardActionChange   = function(action) {};

        // keyboard events
        THREEx.KeyboardState.ALIAS.plus     = 107;
        THREEx.KeyboardState.ALIAS.minus    = 109;
        THREEx.KeyboardState.ALIAS.left     = 100;
    	THREEx.KeyboardState.ALIAS.right    = 102;
    	THREEx.KeyboardState.ALIAS.up       = 104;
    	THREEx.KeyboardState.ALIAS.down     = 98;
    	THREEx.KeyboardState.ALIAS.pageup   = 105;
    	THREEx.KeyboardState.ALIAS.pagedown = 99;
        self.keyboard = new THREEx.KeyboardState();
        self.keyboard.domElement.addEventListener('keydown', function(e) {
            // enable/disable keyboard action
            if (self.keyboard.eventMatches(e, 'escape')) {
                if (self.keyboardActionEnabled) {
                    self.keyboardActionEnabled = false;
                    self.onKeyboardActionDisabled(self.keyboardAction);
                }
                else {
                    self.keyboardActionEnabled = true;
                    self.onKeyboardActionEnabled(self.keyboardAction);
                }
            }

            // if disabled...
            if (! self.keyboardActionEnabled) {
                return false;
            }

            // set action and parameters
            if (self.keyboard.eventMatches(e, 'm')) {
                self.keyboardAction.target = 'position';
                self.keyboardAction.unit   = 1;
                self.onKeyboardActionChange(self.keyboardAction);
            }
            else if (self.keyboard.eventMatches(e, 'r')) {
                self.keyboardAction.target = 'rotation';
                self.keyboardAction.unit   = 1;
                self.onKeyboardActionChange(self.keyboardAction);
            }
            else if (self.keyboard.eventMatches(e, 's')) {
                self.keyboardAction.target = 'scale';
                self.keyboardAction.unit   = 0.1;
                self.onKeyboardActionChange(self.keyboardAction);
            }
            else if (self.keyboard.eventMatches(e, 'left') || self.keyboard.eventMatches(e, 'right')) {
                self.keyboardAction.axis = 'x';
                self.onKeyboardActionChange(self.keyboardAction);
            }
            else if (self.keyboard.eventMatches(e, 'up') || self.keyboard.eventMatches(e, 'down')) {
                self.keyboardAction.axis = 'y';
                self.onKeyboardActionChange(self.keyboardAction);
            }
            else if (self.keyboard.eventMatches(e, 'pageup') || self.keyboard.eventMatches(e, 'pagedown')) {
                self.keyboardAction.axis = 'z';
                self.onKeyboardActionChange(self.keyboardAction);
            }

            // increment/decrement on current action
            var transformSelectedMeshes = false;

            if (self.keyboard.eventMatches(e, 'right') || self.keyboard.eventMatches(e, 'up') || self.keyboard.eventMatches(e, 'pageup')) {
                self.keyboardAction.operation = '+';
                transformSelectedMeshes = true;
            }
            else if (self.keyboard.eventMatches(e, 'left') || self.keyboard.eventMatches(e, 'down') || self.keyboard.eventMatches(e, 'pagedown')) {
                self.keyboardAction.operation = '-';
                transformSelectedMeshes = true;
            }

            if (transformSelectedMeshes) {
                //console.log(self.keyboardAction);
                self.transformSelectedMeshes(self.keyboardAction);
                self.render();
            }
        });

        // set center point
        self.setCenter();

        // add the light's
        settings.lights.ambient.enabled      && self.setAmbientLight();
        settings.lights.directional1.enabled && self.setDirectionalLight(1);
        settings.lights.directional2.enabled && self.setDirectionalLight(2);

        // set others built in elements
        settings.floor.enabled       && self.setFloor();
        settings.grid.enabled        && self.setGrid();
        settings.axes.enabled        && self.setAxes();
        settings.buildVolume.enabled && self.setBuildVolume();

        // set default view
        self.setView(settings.view);

        // set starting z-index (renderOrder for meshes)
        self.zIndex = 10;

        // selected meshes collection indexed by uuid
        self.selectedMeshes = {};

        // (re)render
        self.render();
    },

    // -------------------------------------------------------------------------

    /**
    * Get an element from the scene.
    *
    * @method getElement
    * @param  {String} name
    */
    getElement: function(name) {
        return this.elements[name] || null;
    },

    /**
    * Remove an element from the scene.
    *
    * @method removeElement
    * @param  {String} name
    */
    removeElement: function(name) {
        // get element if exist
        var element = this.getElement(name);

        // if set, remove it
        if (element) {
            if (name == 'floor') {
                this.events.removeEventListener(element, 'dblclick', true);
            }

            this.scene.remove(element);
            element.geometry.dispose();
            element.material.dispose();
            element = null;
        }
    },

    /**
    * Add an element to the scene.
    *
    * @method setElement
    * @param  {String}         name
    * @param  {THREE.Object3D} element
    * @param  {Object}         options
    */
    setElement: function(name, element, options) {
        // merge user and defaults options
        var options = _.defaults(options || {}, {
            replace : false,
            position: {},
            rotation: {}
        });

        // if already defined
        if (this.getElement(name)) {
            if (! options.replace) {
                return console.error('duplicateElementName', name);
            }
            this.removeElement(name);
        }

        // set element position and rotation
        element.position = _.assign(element.position, options.position);
        element.rotation = _.assign(element.rotation, options.rotation);

        // set element up to Z
        element.up = THREE.Vector3(0, 0, 1);

        // if not an built in element, enable live edition
        if (this.builtInElements.indexOf(name) === -1) {
            // to do...
        }

        // register and add element to scene
        this.elements[name] = element;
        this.scene.add(element);
    },

    /**
    * Toggle an element visibility.
    *
    * @method toggleElement
    * @param  {String}  name
    * @param  {Boolean} visible
    */
    toggleElement: function(name, visible) {
        // get the element
        var element = this.getElement(name);

        // is an built in element ?
        if (this.builtInElements.indexOf(name) !== -1) {
            var camelName = name.charAt(0).toUpperCase() + name.slice(1);
        }

        // if not found but built in element
        if (! element && camelName && visible !== false) {
            // create the built in element
            this['set' + camelName]();
        }
        else if (element) {
            // toggle visibility on undefined value
            if (visible === undefined) {
                visible = ! element.visible
            }

            // set element visibility
            element.visible = visible;
        }
    },

    // -------------------------------------------------------------------------
    // Built in elements
    // -------------------------------------------------------------------------

    /**
    * Set/update center element.
    *
    * @method setCenter
    * @param  {Integer} x
    * @param  {Integer} y
    * @param  {Integer} z
    */
    setCenter: function(x, y, z) {
        // get center element if exist
        var center = this.getElement('center');

        // if not set
        if (! center) {
            center = new THREE.Object3D();
            this.setElement('center', center);
        }

        // update position
        center.position.set(
            (x !== undefined) ? x : (this.settings.buildVolume.size.x / 2),
            (y !== undefined) ? y : (this.settings.buildVolume.size.y / 2),
            (z !== undefined) ? z : (this.settings.buildVolume.size.z / 2)
        );
    },

    /**
    * Set ambient light.
    *
    * @method setAmbientLight
    */
    setAmbientLight: function() {
        var color = this.settings.lights.ambient.color;
        var light = new THREE.AmbientLight(color);
        this.setElement('ambientLight', light);
    },

    /**
    * Set directional light.
    *
    * @method setAmbientLight
    * @param  {Integer} id
    */
    setDirectionalLight: function(id) {
        // build volume alias
        var bv       = this.settings.buildVolume;
        var settings = this.settings.lights['directional' + id];

        // create the directional light
        var light = new THREE.DirectionalLight(settings.color, settings.alpha);

        // set position
        if (settings.position === 'auto') {
            light.position.set(id ? bv.size.x : 0, 0, bv.size.z / 1.5);
        } else {
            light.position = _.assign(light.position, settings.position)
        }

        // look at center
        light.target = this.getElement('center');

        // enable shadow map
        if (this.settings.shadowMap.enabled) {
            light.castShadow      = true;
            light.shadowMapWidth  = 1024;
            light.shadowMapHeight = 1024;
        }

        // add ligth to elements list/scene
        this.setElement('directionalLight' + id, light);
    },

    /**
    * Set directional light n°1.
    *
    * @method setAmbientLight1
    */
    setDirectionalLight1: function(id) {
        this.setDirectionalLight(1);
    },

    /**
    * Set directional light n°2.
    *
    * @method setAmbientLight2
    */
    setDirectionalLight2: function() {
        this.setDirectionalLight(2);
    },

    /**
    * Set/update the floor.
    *
    * @method setFloor
    */
    setFloor: function(replace) {
        // create element
        var floor = new THREE.Mesh(
            new THREE.PlaneBufferGeometry(
                this.settings.buildVolume.size.x + this.settings.floor.margin,
                this.settings.buildVolume.size.y + this.settings.floor.margin
            ),
            new THREE.MeshLambertMaterial({ color: this.settings.floor.color })
        );

        // set position
        floor.position.x = this.settings.buildVolume.size.x / 2;
        floor.position.y = this.settings.buildVolume.size.y / 2;
        floor.position.z = 0;

        // enable shadow map
        floor.receiveShadow = this.settings.shadowMap.enabled;

        // render order
        floor.renderOrder = 1;

        // double click on floor to unselect all object
        var self = this;
        this.events.addEventListener(floor, 'dblclick', function(event) {
            if (Object.keys(self.selectedMeshes).length > 0) {
                self.unselectAllMeshes();
            } else {
                self.selectAllMeshes();
            }
            self.render();
        });

        // add element to scene
        this.setElement('floor', floor, { replace: replace });
    },

    /**
    * Set/update the floor.
    *
    * @method setGrid
    */
    setGrid: function(replace) {
        // create element
        var grid = new THREE.GridHelper(
            this.settings.buildVolume.size.x, this.settings.buildVolume.size.y,
            this.settings.grid.size1        , this.settings.grid.size1,
            this.settings.grid.size2        , this.settings.grid.size2,
            this.settings.grid.color1       , this.settings.grid.color2
        );

        // render order
        grid.renderOrder = 2;

        // add element to scene
        this.setElement('grid', grid, { replace: replace });
    },

    /**
    * Set/update axes.
    *
    * @method setAxes
    */
    setAxes: function(replace) {
        // create and add element to scene
        var axes = new THREE.AxesHelper(
            this.settings.buildVolume.size.x,
            this.settings.buildVolume.size.y,
            this.settings.buildVolume.size.z
        );

        // render order
        axes.renderOrder = 3;

        // add element to scene
        this.setElement('axes', axes, { replace: replace });
    },

    /**
    * Set/update the build volume.
    *
    * @method setBuildVolume
    */
    setBuildVolume: function(replace) {
        // create element
        var buildVolume = new THREE.Mesh(
            new THREE.BoxGeometry(
                this.settings.buildVolume.size.x,
                this.settings.buildVolume.size.y,
                this.settings.buildVolume.size.z
            ),
            new THREE.MeshLambertMaterial({
                transparent: true,
                color      : this.settings.buildVolume.color,
                opacity    : this.settings.buildVolume.alpha
            })
        );

        // set position
        buildVolume.position.x = this.settings.buildVolume.size.x / 2;
        buildVolume.position.y = this.settings.buildVolume.size.y / 2;
        buildVolume.position.z = this.settings.buildVolume.size.z / 2;

        // render order
        buildVolume.renderOrder = 4;

        // add element to scene
        this.setElement('buildVolume', buildVolume, { replace: replace });
    },

    // -------------------------------------------------------------------------

    /**
    * resize the build volume.
    *
    * @method resizeBuildVolume
    * @param  {Object} size
    */
    resizeBuildVolume: function(size) {
        this.settings.buildVolume.size.x = size.x;
        this.settings.buildVolume.size.y = size.y;
        this.settings.buildVolume.size.z = size.z;

        this.getElement('floor')       && this.setFloor(true);
        this.getElement('grid')        && this.setGrid(true);
        this.getElement('axes')        && this.setAxes(true);
        this.getElement('buildVolume') && this.setBuildVolume(true);

        this.setCenter();
        this.lookAtCenter();
    },

    // -------------------------------------------------------------------------

    /**
    * Get the minimal distance to show an plan.
    *
    * @method getVisibleDistance
    * @param  {Integer} width
    * @param  {Integer} height
    * @return {Integer}
    */
    getVisibleDistance: function(width, height) {
        var margin = this.settings.floor.margin * 2;
        var size   = height + margin;
        var aspect = width / height;

        // landscape or portrait orientation
        if (this.camera.aspect < aspect) {
            size = (width + margin) / this.camera.aspect;
        }

        return size / 2 / Math.tan(Math.PI * this.camera.fov / 360);
    },

    /**
    * Set the camera look at center of build volume.
    *
    * @method lookAtCenter
    * @param  {Boolean} update
    */
    lookAtCenter: function(update) {
        // set camera target to center of build volume
        this.controls.target  = this.getElement('center').position;
        this.controls.target0 = this.controls.target.clone();

        // update controls if requested
        update && this.controls.update();
    },

    /**
    * Set the view.
    *
    * @method setView
    * @param  {String} view
    */
    setView: function(view) {
        // reset camera position
        this.controls.reset();

        // set new position
        var x = 0;
        var y = 0;
        var z = 0;
        var w, h;

        var size = this.settings.buildVolume.size;

        view = view || 'default';

        if (view == 'default' || view == 'front') {
            x = size.x / 2;
            z = size.z / 2;
            w = size.x;
            h = size.z;
        }
        else if (view == 'right') {
            x = size.x;
            y = size.y / 2;
            z = size.z / 2;
            w = size.y;
            h = size.z;
        }
        else if (view == 'back') {
            x = size.x / 2;
            y = size.y;
            z = size.z / 2;
            w = size.x;
            h = size.z;
        }
        else if (view == 'left') {
            y = size.y / 2;
            z = size.z / 2;
            w = size.y;
            h = size.z;
        }
        else if (view == 'top') {
            x = size.x / 2;
            y = size.y / 2;
            z = size.z;
            w = size.x;
            h = size.y;
        }
        else if (view == 'bottom') {
            x = size.x / 2;
            y = size.y / 2;
            w = size.x;
            h = size.y;
        }

        // ensure the build volume is visible
        var distance = this.getVisibleDistance(w, h);

        if (view == 'default' || view == 'front') {
            y = y - distance;
        }
        else if (view == 'right') {
            x = x + distance;
        }
        else if (view == 'back') {
            y = y + distance;
        }
        else if (view == 'left') {
            x = x - distance;
        }
        else if (view == 'top') {
            z = z + distance;
        }
        else if (view == 'bottom') {
            z = z - distance;
        }

        // set default view
        if (view == 'default') {
            z = z * 2.5;
            x = x * 2.5;
        }

        // set new camera position
        this.camera.position.set(x, y, z);

        // set the camera look at center of build volume
        this.lookAtCenter(true);
    },

    // -------------------------------------------------------------------------

    /**
    * Resize the scene.
    *
    * @method setView
    * @param  {String} view
    */
    resize: function(width, height) {
        // update camera
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();

        // resize the renderer
        this.renderer.setSize(width, height);
    },

    // -------------------------------------------------------------------------

    /**
    * Render the scene.
    *
    * @method render
    */
    render: function() {
        this.renderer.render(this.scene, this.camera);
    },

    // -------------------------------------------------------------------------

    /**
    * Create and return an THREE.Geometry object from faces collection.
    *
    * @method createGeometry
    * @param  {Array} faces
    */
    createGeometry: function(faces) {
        var geometry = new THREE.Geometry();
        var triangle = null;
        var normals  = null;
        var vertices = null;
        var vertex   = null;
        var length   = null;

        for (var i = 0; i < faces.length; i++) {

            triangle = faces[i];
            vertices  = triangle.vertices;

            for (var j = 0; j < vertices.length; j++) {
                vertex = vertices[j];
                geometry.vertices.push(new THREE.Vector3(vertex[0], vertex[1], vertex[2]));
            }

            length  = geometry.vertices.length;
            normals = triangle.normals;
            normals = new THREE.Vector3(normals[0], normals[1], normals[2]);

            geometry.faces.push(new THREE.Face3(length - 3, length - 2, length - 1, normals));
        }

        return geometry;
    },

    /**
    * Create and return an THREE.BufferGeometry object from faces collection.
    *
    * @method createBufferGeometry
    * @param  {Array} faces
    */
    createBufferGeometry: function(faces) {
        var geometry = new THREE.BufferGeometry();
        var vertices = new Float32Array(faces.length * 3 * 3);
        var normals  = new Float32Array(faces.length * 3 * 3);
        var triangle = null;
        var vertex   = null;
        var offset   = 0;
        var x, y, z;

        for (var i = 0; i < faces.length; i++) {
            triangle = faces[i];

            x = triangle.normals[0];
            y = triangle.normals[1];
            z = triangle.normals[2];

            for (var j = 0; j  < triangle.vertices.length; j++) {
                vertex = triangle.vertices[j];

                normals[offset]     = x;
                normals[offset + 1] = y;
                normals[offset + 2] = z;

                vertices[offset]     = vertex[0];
                vertices[offset + 1] = vertex[1];
                vertices[offset + 2] = vertex[2];

                offset += 3;
            }
        }

        geometry.addAttribute('position', new THREE.BufferAttribute(vertices, 3));
        geometry.addAttribute('normal'  , new THREE.BufferAttribute(normals , 3));

        return geometry;
    },

    /**
    * Return an instance from an registred material.
    *
    * @method getMaterial
    * @param  {String} name
    */
    getMaterial: function(name) {
        var config = this.settings.materials[name || 'default'];
        var settings = _.defaults({}, config.settings);
        if (settings.color == 'random') {
            settings.color = randomColor();
        }
        return new config.material(settings);
    },

    /**
    * Create a mesh from an array of faces.
    *
    * @method createMesh
    * @param  {Array} faces
    */
    createMesh: function(faces, material, center) {
        // create geometry from faces collection
        //var geometry = this.createBufferGeometry(faces);
        var geometry = this.createGeometry(faces);

        var center = center === false ? false : true;

        // compute geometry
        geometry.computeBoundingSphere();
        geometry.computeBoundingBox();
        center && geometry.center();

        // set bottom of object at Z = 0
        center && geometry.translate(0, 0, geometry.boundingBox.max.z);

        // create and return the mesh object
        return new THREE.Mesh(geometry, this.getMaterial(material));
    },

    /**
    * Group connected faces.
    *
    * --> Naive implementation by a big noob <--
    *
    * @method groupFaces
    * @param  {Array} faces
    * @param  {Array} vertices
    * @return {Array}
    */
    groupFaces: function(faces, vertices) {
        // groups of faces
        var faces_groups = [];

        // groups of vertex hashs
        var vertex_groups = [];

        // return a vertex hash
        function vertexHash(vertex) {
            return vertex.x + '|' + vertex.y + '|' + vertex.z;
        }

        // return group ids
        function findHashGroups() {
            var groups = [];
            for (var i = 0; i < vertex_groups.length; i++) {
                if (vertex_groups[i][h1]
                ||  vertex_groups[i][h2]
                ||  vertex_groups[i][h3]) {
                    groups.push(i);
                }
            }
            return _.uniq(groups);
        }

        // push the face in group id
        function pushFaceInGroup(id) {
            vertex_groups[id] || (vertex_groups[id] = []);
            faces_groups[id]  || (faces_groups[id]  = []);
            vertex_groups[id][h1] = true;
            vertex_groups[id][h2] = true;
            vertex_groups[id][h3] = true;
            faces_groups[id].push(face);
        }

        var face, h1, h2, h3, g;
        var groupId = -1;

        // for each face
        for (var i = 0; i < faces.length; i++) {
            // current face
            face = faces[i];

            // vertex hashs
            h1 = vertexHash(vertices[face.a]);
            h2 = vertexHash(vertices[face.b]);
            h3 = vertexHash(vertices[face.c]);

            // find owner groups
            g = findHashGroups();

            // no group found
            if (! g.length) {
                // increment group id
                groupId++;

                // add face to group
                pushFaceInGroup(groupId);
            }

            // only in one group
            else if (g.length == 1) {
                // add face to group
                pushFaceInGroup(g[0]);
            }

            // share two group
            else if (g.length == 2) {
                // add face to first group
                pushFaceInGroup(g[0]);

                // merge the two group
                faces_groups[g[0]]  = faces_groups[g[0]].concat(faces_groups[g[1]]);
                vertex_groups[g[0]] = _.merge(vertex_groups[g[0]], vertex_groups[g[1]]);

                // reset the second group
                faces_groups[g[1]]  = [];
                vertex_groups[g[1]] = [];
            }
        }

        // reset vertex group
        vertex_groups = null;

        // remove empty group
        faces_groups = _.filter(faces_groups, function(o) { return o.length; });

        // return grouped faces
        return faces_groups;
    },

    /**
    * Split mesh.
    *
    * @method splitMeshe
    */
    splitMesh: function(uuid) {
        var mesh     = this.getElement(uuid);
        var vertices = mesh.geometry.vertices;
        var groups   = this.groupFaces(mesh.geometry.faces, vertices);

        // no group found
        if (groups.length < 2) {
            return null;
        }

        // current group
        var group, face, v1, v2, v3, faces;

        for (var gid = 0; gid < groups.length; gid++) {
            group = groups[gid];
            faces = [];
            for (var i = 0; i < group.length; i++) {
                face = group[i];
                v1   = vertices[face.a];
                v2   = vertices[face.b];
                v3   = vertices[face.c];
                faces.push({
                    normals: [
                        face.normal.x,
                        face.normal.y,
                        face.normal.z
                    ],
                    vertices: [
                        [v1.x, v1.y, v1.z],
                        [v2.x, v2.y, v2.z],
                        [v3.x, v3.y, v3.z]
                    ]
                });
            }
            this.selectedMeshes[uuid] = null;
            this.addMesh(mesh.name + ' [' + gid + ']', faces, null, false);
        }
        this.removeMesh(uuid);
        groups = null;
    },

    /**
    * Remove  mesh.
    *
    * @method removeMesh
    */
    removeMesh: function(uuid) {
        var mesh = this.getElement(uuid);
        this.events.removeEventListener(mesh, 'dblclick', true);
        this.selectedMeshes[uuid] = null;
        delete this.selectedMeshes[uuid];
        this.removeElement(uuid);
        this.onMeshRemoved(uuid);
    },

    /**
    * Split all selected meshes.
    *
    * @method splitSelectedMeshes
    */
    splitSelectedMeshes: function() {
        for (var uuid in this.selectedMeshes) {
            this.splitMesh(uuid);
        }
    },

    /**
    * Drop mesh.
    *
    * @method dropMesh
    */
    dropMesh: function(uuid) {
        var mesh = this.getElement(uuid);
        var move = mesh.geometry.center();
        mesh.geometry.translate(0, 0, mesh.geometry.boundingBox.max.z);
        mesh.position.x -= move.x;
        mesh.position.y -= move.y;
        mesh.position.z = 0;
    },

    /**
    * Drop all selected meshes.
    *
    * @method splitSelectedMeshes
    */
    dropSelectedMeshes: function() {
        for (var uuid in this.selectedMeshes) {
            this.dropMesh(uuid);
        }
    },

    /**
    * Create and add a mesh from an array of faces.
    *
    * @method addMesh
    * @param  {Array} faces
    */
    addMesh: function(name, faces, material, center) {
        // self alias
        var self = this;

        // create the mesh object
        var mesh  = self.createMesh(faces, material, center);
        var color = mesh.material.color.getHex();

        // increment z-index
        mesh.renderOrder = self.zIndex++;

        // add some properties
        mesh.facesCount = faces.length;
        mesh.selected = false;
        mesh.name = name;

        // backup original color
        mesh.material.originalColor = mesh.material.color.getHex();

        // events listeners
        self.events.addEventListener(mesh, 'dblclick', function(event) {
            self.setMeshSelected(mesh, ! mesh.selected);
            self.render();
        }, false);

        // set element to center of build plate
        self.setElement(mesh.uuid, mesh, { position: {
            x: self.settings.buildVolume.size.x / 2,
            y: self.settings.buildVolume.size.y / 2
        }});

        // call public callback
        self.onMeshAdded(mesh);
    },

    // -------------------------------------------------------------------------

    /**
    * Unselect all object.
    *
    * @method toggleMeshSelection
    */
    setMeshSelected: function(mesh, selected) {
        var selected  = selected === undefined ? true : selected;
        if (selected) {
            this.selectedMeshes[mesh.uuid] = mesh;
            mesh.material.color.setHex(this.settings.colors.selected);
        } else {
            this.selectedMeshes[mesh.uuid] = null;
            delete this.selectedMeshes[mesh.uuid];
            mesh.material.color.setHex(mesh.material.originalColor);
        }
        mesh.selected    = !! selected;
        mesh.renderOrder = this.zIndex++; // force on top


        // public event
        this.onMeshSelected(mesh, selected);
    },

    /**
    * Unselect all object.
    *
    * @method unselectAllMeshes
    */
    unselectAllMeshes: function() {
        for (var id in this.selectedMeshes) {
            this.setMeshSelected(this.selectedMeshes[id], false);
        }
    },

    /**
    * Unselect all object.
    *
    * @method unselectAllMeshes
    */
    selectAllMeshes: function() {
        for (var id in this.elements) {
            var mesh = this.elements[id];
            mesh.name.length && this.setMeshSelected(mesh, true);
        }
    },

    /**
    * Execute an transformation on selected meshes.
    *
    * @method transformSelectedMeshes
    * @param  {Object} action
    */
    transformSelectedMeshes: function(action) {
        var id, mesh, unit, axis;
        for (id in this.selectedMeshes) {
            mesh = this.selectedMeshes[id];
            unit = action.unit;
            if (action.target == 'rotation') {
                unit = unit * Math.PI / 180;
            }
            if (action.operation == '+') {
                mesh[action.target][action.axis] += unit;
            } else if (action.operation == '-') {
                mesh[action.target][action.axis] -= unit;
            }
        }
    }
});
