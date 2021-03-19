/**
 * @author dlannan / https://github.com/dlannan
 *
 */

THREE.WaterNice = function ( geometry, options ) {

	THREE.Mesh.call( this, geometry );
	
    geometry.computeFaceNormals();
    geometry.computeVertexNormals();
    THREE.BufferGeometryUtils.computeTangents( geometry );

	var scope = this;

	options = options || {};

	var textureWidth = options.textureWidth !== undefined ? options.textureWidth : 512;
	var textureHeight = options.textureWidth !== undefined ? options.textureHeight : 512;

	var clipBias = options.clipBias !== undefined ? options.clipBias : 0.0;
	var time = options.time !== undefined ? options.time : 0.0;
    var normalSampler = options.waterNormals !== undefined ? options.waterNormals : null;
	var sunPos = options.sunPos !== undefined ? options.sunPos : new THREE.Vector3( 0.0, 0.0, 0.0) ;
	var sunColor = new THREE.Color( options.sunColor !== undefined ? options.sunColor : 0xffffff );
	var side = options.side !== undefined ? options.side : THREE.DoubleSide;
	var fog = options.fog !== undefined ? options.fog : false;

	//

    var mirrorPlane = new THREE.Plane();
	var normal = new THREE.Vector3();
	var mirrorWorldPosition = new THREE.Vector3();
	var cameraWorldPosition = new THREE.Vector3();
	var rotationMatrix = new THREE.Matrix4();
	var lookAtPosition = new THREE.Vector3( 0, 0, - 1 );
	var clipPlane = new THREE.Vector4();

	var view = new THREE.Vector3();
	var target = new THREE.Vector3();
	var q = new THREE.Vector4();

	var textureMatrix = new THREE.Matrix4();
	var mirrorCamera = new THREE.PerspectiveCamera();

	var parameters = {
		minFilter: THREE.LinearFilter,
		magFilter: THREE.LinearFilter,
		format: THREE.RGBFormat,
		stencilBuffer: false
	};

	var RT = new THREE.WebGLRenderTarget( textureWidth, textureHeight, parameters );

	RT.depthBuffer = true;
	RT.depthTexture = new THREE.DepthTexture();
	RT.depthTexture.type = THREE.UnsignedShortType;	
	RT.texture.generateMipmaps = false;

	var baseRender = new THREE.WebGLRenderTarget( textureWidth, textureHeight, parameters );

	baseRender.depthBuffer = true;
	baseRender.depthTexture = new THREE.DepthTexture();
	baseRender.depthTexture.type = THREE.UnsignedShortType;	
	baseRender.texture.generateMipmaps = false;

	var mirrorShader = {

		uniforms: THREE.UniformsUtils.merge( [
			THREE.UniformsLib[ 'fog' ],
			THREE.UniformsLib[ 'lights' ],
			{
				normalSampler: { value: null },
				tDepth: { value: null },
				
                refractionSampler: { value: null },                
				mirrorSampler: { value: null },

				Visibility: { value: 28.0 },
				WindDir: { value: new THREE.Vector2(-0.5, -0.8) },
				WindSpeed: { value: 0.6 },
				WaveScale: { value: 0.1},
				ScatterAmount: { value: 3.5 },
				ScatterColor: { value: new THREE.Vector3(0, 1.0, 0.95) },
				ReflDistortionAmount: { value: 0.03 },
				RefrDistortionAmount: { value: 0.04 },
				AberrationAmount: { value: 0.002 },
				WaterExtinction: { value: new THREE.Vector3(0.6, 0.8, 1.0) },
				sunTransmittance: { value:  new THREE.Vector3(0.6, 0.8, 1.0) },
				sunFade: { value: 1.5 },
				scatterFade: { value: 1.0 },
				waterDarker: { value: 0.7 },
              
                textureMatrix: { value: new THREE.Matrix4() },
                
				sunColor: { value: new THREE.Color( 0x7F7F7F ) },
				sunPos: { value: new THREE.Vector3( 0.0, 0.0, 0.0 ) },

				bigWaves: { value: new THREE.Vector2( 0.3, 0.3 ) },
				midWaves: { value: new THREE.Vector2( 0.3, 0.15 ) },
				smallWaves: { value: new THREE.Vector2( 0.15, 0.1 ) },

				cameraNear:   { value: 0.3 },
				cameraFar:   { value: 2500.0 },
                time: { value: 0.0 },                
			}
		] ),

        // Predefined variables
        // // = object.matrixWorld
        // 'uniform mat4 modelMatrix;',
        // // = camera.matrixWorldInverse * object.matrixWorld
        // 'uniform mat4 modelViewMatrix;',
        // // = camera.projectionMatrix
        // 'uniform mat4 projectionMatrix;',
        // // = camera.matrixWorldInverse
        // 'uniform mat4 viewMatrix;',
        // // = inverse transpose of modelViewMatrix
        // 'uniform mat3 normalMatrix;',
        // // = camera position in world space
        // 'uniform vec3 cameraPosition;',

		vertexShader: [
			'uniform mat4 textureMatrix;',
			'varying vec4 worldPosition;',
			'varying vec3 viewDir;',
			'varying vec4 sPosition;',
			'varying vec4 mPosition;',

			THREE.ShaderChunk[ 'fog_pars_vertex' ],
			THREE.ShaderChunk[ 'shadowmap_pars_vertex' ],

			'vec4 GetScreenPos( vec4 pos ) {',
			' 	vec4 o = pos * 0.5;',
			'	o.xy = vec2(o.x, o.y) + o.w;',
			'	o.zw = pos.zw;',
			'	return o;',
			'}',

			'void main() {',
			'	worldPosition = modelMatrix * vec4( position, 1.0 );',
			'	viewDir = cameraPosition.xyz - worldPosition.xyz;',
            '   vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );',
			'	sPosition = GetScreenPos( projectionMatrix * mvPosition );',
			'	gl_Position = projectionMatrix * mvPosition;',

			THREE.ShaderChunk[ 'fog_vertex' ],
			THREE.ShaderChunk[ 'shadowmap_vertex' ],

			'}'
		].join( '\n' ),

		fragmentShader: [

			'uniform float Visibility;',
			'uniform vec2 WindDir;',
			'uniform float WindSpeed;',
			'uniform float WaveScale;',
			'uniform float ScatterAmount;',
			'uniform vec3 ScatterColor;',
			'uniform float ReflDistortionAmount;',
			'uniform float RefrDistortionAmount;',
			'uniform float AberrationAmount;',
			'uniform vec3 WaterExtinction;',
			'uniform vec3 sunTransmittance;',
			'uniform float sunFade;',
			'uniform float scatterFade;',
			'uniform float waterDarker;',

			'uniform sampler2D 	refractionSampler;',
			'uniform sampler2D 	normalSampler;',
			'uniform sampler2D 	mirrorSampler;',
			'uniform sampler2D 	tDepth;',

			'uniform float cameraNear;',
			'uniform float cameraFar;',						
			'uniform float time;',

			'uniform vec3 sunColor;',
			'uniform vec3 sunPos;',
			
			'varying vec4 sPosition;',
			'varying vec3 viewDir;',
			'varying vec4 worldPosition;',

			'uniform vec2 bigWaves;',
			'uniform vec2 midWaves;',
			'uniform vec2 smallWaves;',
			'',

			THREE.ShaderChunk[ 'common' ],
			THREE.ShaderChunk[ 'packing' ],
			THREE.ShaderChunk[ 'bsdfs' ],
			THREE.ShaderChunk[ 'fog_pars_fragment' ],
			THREE.ShaderChunk[ 'lights_pars_begin' ],
			THREE.ShaderChunk[ 'shadowmap_pars_fragment' ],
			THREE.ShaderChunk[ 'shadowmask_pars_fragment' ],

            'float fresnel_dielectric(vec3 Incoming, vec3 Normal, float eta)',
            '{',
            '    // compute fresnel reflectance without explicitly computing',
            '    // the refracted direction',
            '    float c = abs(dot(Incoming, Normal));',
            '    float g = eta * eta - 1.0 + c * c;',
            '',
            '    if(g > 0.0)',
            '    {',
            '        g = sqrt(g);',
            '        float A = (g - c) / (g + c);',
            '        float B = (c * (g + c) - 1.0) / (c * (g - c) + 1.0);',
            '',        
            '        return 0.5 * A * A * (1.0 + B * B);',
            '    }',
            '',    
            '    return 1.0; // TIR (no refracted component)',
			'}',			

			'float readDepth( sampler2D depthSampler, vec2 coord ) {',
            '    float fragCoordZ = texture2D( depthSampler, coord ).x;',
            '    float viewZ = perspectiveDepthToViewZ( fragCoordZ, cameraNear, cameraFar );',
            '    return viewZToOrthographicDepth( viewZ, cameraNear, cameraFar );',
			'}',

			'void main() {',
			'{',
				'vec2 fragCoord = sPosition.xy / sPosition.w;',
				'vec2 mirrorCoord = vec2(1.0 - fragCoord.x, 1.0 - fragCoord.y);',
			    'fragCoord = clamp(fragCoord, 0.002, 0.998);',
			    '',
				'bool aboveWater = cameraPosition.y > 0.0;',
				'if(aboveWater) mirrorCoord = vec2(1.0 - fragCoord.x, fragCoord.y);',
                                                '',
                'float normalFade = 0.0; //1.0 - min(exp(-sPosition.w / 40.0), 1.0);           ',
				'',
			    'vec2 nCoord = worldPosition.xz * WaveScale * 0.04 + WindDir * time * WindSpeed * 0.04;',
                'vec3 normal0 = 2.0 * texture2D(normalSampler, nCoord + vec2(-time * 0.015, -time * 0.005)).xyz - 1.0;',
                'nCoord = worldPosition.xz * WaveScale * 0.1 + WindDir * time * WindSpeed * 0.08;',
                'vec3 normal1 = 2.0 * texture2D(normalSampler, nCoord + vec2(time * 0.020, time * 0.015)).xyz - 1.0;',
             	'',
                'nCoord = worldPosition.xz * WaveScale * 0.25 + WindDir * time * WindSpeed * 0.07;',
                'vec3 normal2 = 2.0 * texture2D(normalSampler, nCoord + vec2(-time * 0.04, -time * 0.03)).xyz - 1.0;',
                'nCoord = worldPosition.xz * WaveScale * 0.5 + WindDir * time * WindSpeed * 0.09;',
                'vec3 normal3 = 2.0 * texture2D(normalSampler, nCoord + vec2(time * 0.03, time * 0.04)).xyz - 1.0;',
                '',
                'nCoord = worldPosition.xz * WaveScale * 1.0 + WindDir * time * WindSpeed * 0.4;',
                'vec3 normal4 = 2.0 * texture2D(normalSampler, nCoord + vec2(-time * 0.02, time * 0.1)).xyz - 1.0;  ',
                'nCoord = worldPosition.xz * WaveScale * 2.0 + WindDir * time * WindSpeed * 0.7;',
                'vec3 normal5 = 2.0 * texture2D(normalSampler, nCoord + vec2(time * 0.1, -time * 0.06)).xyz - 1.0;',
                '',
                'vec3 normal = normalize(normal0 * bigWaves.x + normal1 * bigWaves.y +',
                                        'normal2 * midWaves.x + normal3 * midWaves.y +',
                                        'normal4 * smallWaves.x + normal5 * smallWaves.y);',
                '',
                'vec3 nVec = mix(normal.xzy, vec3(0., 1., 0.), normalFade); // converting normals to tangent space ',
                'vec3 vVec = normalize(viewDir);',
                'vec3 lVec = sunPos.xyz;',
			    '',
			    '// normal for light scattering',
                'vec3 lNormal = normalize(normal0 * bigWaves.x * 0.5 + normal1 * bigWaves.y * 0.5 +',
                                        'normal2 * midWaves.x * 0.1 + normal3 * midWaves.y * 0.1 +',
                                        'normal4 * smallWaves.x * 0.1 + normal5 * smallWaves.y * 0.1);',
                'lNormal = mix(lNormal.xzy, vec3(0., 1., 0.), normalFade);',
                                '',
                'vec3 lR = reflect(-lVec, lNormal);',
                '',
				'float s = max(dot(lR, vVec) * 2.0 - 1.2, 0.);',
				'float sunMisc = sunFade * clamp(1.0 - exp(-sunPos.y), 0.0, 1.0);',
				'float sunMiscTwo = clamp(dot(-lVec, lNormal) * 0.7 + 0.3, 0.0, 1.0);',
                'float lightScatter = clamp((sunMiscTwo * s) * ScatterAmount, 0.0, 1.0) * sunMisc;',
                'vec3 sC = mix(ScatterColor * vec3(1.0, 0.4, 0.0), ScatterColor, sunTransmittance);',
            	'',
                '// fresnel term',
                'float ior = aboveWater ? (1.333 / 1.0) : (1.0 / 1.333); // air to water; water to air',
                'float fresnel = fresnel_dielectric(-vVec, nVec, ior);',
			    '',
			    '// texture edge bleed removal is handled by clip plane offset',
                'vec3 reflection = texture2D(mirrorSampler, mirrorCoord + nVec.xz * vec2(ReflDistortionAmount, ReflDistortionAmount * 6.)).rgb;',
				'',
                'vec3 luminosity = vec3(0.30, 0.59, 0.11);',
                'float reflectivity = pow(dot(luminosity, reflection.rgb * 5.0), 3.0);',
                    '',
                'vec3 R = reflect(vVec, nVec);',
            	'',
                'float specular = min(pow(atan(max(dot(R, -lVec), 0.0) * 1.55), 1000.0) * reflectivity * 8.0, 150.0);',
            	'',
                'vec2 rcoord = reflect(vVec, nVec).xz;',
                'vec2 refrOffset = nVec.xz * RefrDistortionAmount;',
                '',
                '// depth of potential refracted fragment - this is in camera space. View to obj',
                'float refractedDepth = readDepth(tDepth, fragCoord - refrOffset);',
                'float surfaceDepth = (distance(cameraPosition.xyz, worldPosition.xyz) - cameraNear);',
                'float objdepth = refractedDepth - surfaceDepth / cameraFar;',
                'float distortFade = clamp(objdepth * 2., 0.0, 1.0);',
                '',
                'vec3 refraction;',
                'refraction.r = texture2D(refractionSampler, fragCoord - (refrOffset - rcoord * -AberrationAmount) * distortFade).r;',
                'refraction.g = texture2D(refractionSampler, fragCoord - refrOffset * distortFade).g;',
                'refraction.b = texture2D(refractionSampler, fragCoord - (refrOffset - rcoord * AberrationAmount) * distortFade).b;',
				'',
                'float waterSunGradient = dot(vVec, -sunPos.xyz);',
                'waterSunGradient = clamp(pow(waterSunGradient * 0.7 + 0.3, 2.0), 0.0, 1.0);  ',
                'vec3 waterSunColor = vec3(0.0, 1.0, 0.85) * waterSunGradient;',
                'waterSunColor *= aboveWater ? 0.25 : 0.5;',
                '',
                'float waterGradient = dot(vVec, vec3(0.0, -1.0, 0.0));',
                'waterGradient = clamp((waterGradient * 0.5 + 0.5), 0.2, 1.0);',
                'vec3 watercolor = (vec3(0.0078, 0.5176, 0.700) + waterSunColor) * waterGradient * 1.5;',
                '',
                'watercolor = mix(watercolor * 0.3 * sunFade, watercolor, sunTransmittance);',
                '',
                'float fog = aboveWater ? 1.0 : surfaceDepth / Visibility;',
                '',
                'float darkness = Visibility * 1.0;',
                'darkness = clamp((cameraPosition.y + darkness) / darkness, 0.0, 1.0);',
                '',
                //'if(objdepth < 0.0) refraction *= (1.0 -refractedDepth * 1.5);',
                'refraction = mix(refraction, sC, lightScatter);',
                '',
                'vec3 color;',
            	'',
                'if(aboveWater)',
				'{',
					'color = mix(refraction, reflection, fresnel * 0.6) * waterDarker;',
                '}',
                '// scatter and extinction between surface and camera',
                'else',
                '{',
                    'color = mix(min(refraction * 1.2, 1.0), reflection, fresnel * 0.8);',
                    'color = mix(color, watercolor * darkness * scatterFade, clamp(fog / WaterExtinction, 0.0, 1.0));',
                '}',
                '',
				'gl_FragColor = vec4(vec3(color + (sunColor * specular)), 1.0);',
			'}',

			THREE.ShaderChunk[ 'tonemapping_fragment' ],
			THREE.ShaderChunk[ 'fog_fragment' ],

			'}'
        ].join( '\n' )      
	};

	var material = new THREE.ShaderMaterial( {
		fragmentShader: mirrorShader.fragmentShader,
		vertexShader: mirrorShader.vertexShader,
		uniforms: THREE.UniformsUtils.clone( mirrorShader.uniforms ),
		transparent: false,
		lights: true,
		side: side,
        fog: fog
	} );

	material.uniforms.mirrorSampler.value = RT.texture;
	material.uniforms.refractionSampler.value = baseRender.texture;

	material.uniforms.textureMatrix.value = textureMatrix;
	material.uniforms.time.value = time;
	material.uniforms.normalSampler.value = normalSampler;
	material.uniforms.tDepth.value = baseRender.depthTexture;
	material.uniforms.sunColor.value = sunColor;
	material.uniforms.sunPos.value = sunPos;

	scope.material = material;

	// traverse(function(child) {
	// 	if (child instanceof THREE.Mesh){
	// 		child.material = material;
	// 	}
	// 	geometry.uvsNeedUpdate = true;
	// 	needsUpdate=true;
	// });

    // geometry.computeFaceNormals();
    // geometry.computeVertexNormals();
    // THREE.BufferGeometryUtils.computeTangents( geometry );

	scope.baseRender = baseRender;

	scope.onBeforeRender = function ( renderer, scene, camera ) {

		mirrorWorldPosition.setFromMatrixPosition( scope.matrixWorld );
        cameraWorldPosition.setFromMatrixPosition( camera.matrixWorld );
        
		rotationMatrix.extractRotation( scope.matrixWorld );

		normal.set( 0, 0, 1 );
		normal.applyMatrix4( rotationMatrix );

		view.subVectors( mirrorWorldPosition, cameraWorldPosition );

		// Avoid rendering when mirror is facing away
		if ( view.dot( normal ) > 0 ) return;

		view.reflect( normal ).negate();
		view.add( mirrorWorldPosition );

		rotationMatrix.extractRotation( camera.matrixWorld );

		lookAtPosition.set( 0, 0, - 1 );
		lookAtPosition.applyMatrix4( rotationMatrix );
		lookAtPosition.add( cameraWorldPosition );

		target.subVectors( mirrorWorldPosition, lookAtPosition );
		target.reflect( normal ).negate();
		target.add( mirrorWorldPosition );

		mirrorCamera.position.copy( view );

		mirrorCamera.up.set( 0, 1, 0 );
		mirrorCamera.up.applyMatrix4( rotationMatrix );
		mirrorCamera.up.reflect( normal );
		mirrorCamera.lookAt( target );

		mirrorCamera.far = camera.far; // Used in WebGLBackground

		mirrorCamera.updateMatrixWorld();
		mirrorCamera.projectionMatrix.copy( camera.projectionMatrix );

		// Update the texture matrix
		textureMatrix.set(
			0.5, 0.0, 0.0, 0.5,
			0.0, 0.5, 0.0, 0.5,
			0.0, 0.0, 0.5, 0.5,
			0.0, 0.0, 0.0, 1.0
		);
		textureMatrix.multiply( mirrorCamera.projectionMatrix );
		textureMatrix.multiply( mirrorCamera.matrixWorldInverse );

		// Now update projection matrix with new clip plane, implementing code from: http://www.terathon.com/code/oblique.html
		// Paper explaining this technique: http://www.terathon.com/lengyel/Lengyel-Oblique.pdf
		mirrorPlane.setFromNormalAndCoplanarPoint( normal, mirrorWorldPosition );
		mirrorPlane.applyMatrix4( mirrorCamera.matrixWorldInverse );

		clipPlane.set( mirrorPlane.normal.x, mirrorPlane.normal.y, mirrorPlane.normal.z, mirrorPlane.constant );

		var projectionMatrix = mirrorCamera.projectionMatrix;

		q.x = ( Math.sign( clipPlane.x ) + projectionMatrix.elements[ 8 ] ) / projectionMatrix.elements[ 0 ];
		q.y = ( Math.sign( clipPlane.y ) + projectionMatrix.elements[ 9 ] ) / projectionMatrix.elements[ 5 ];
		q.z = - 1.0;
		q.w = ( 1.0 + projectionMatrix.elements[ 10 ] ) / projectionMatrix.elements[ 14 ];

		// Calculate the scaled plane vector
		clipPlane.multiplyScalar( 2.0 / clipPlane.dot( q ) );

		// Replacing the third row of the projection matrix
		projectionMatrix.elements[ 2 ] = clipPlane.x;
		projectionMatrix.elements[ 6 ] = clipPlane.y;
		projectionMatrix.elements[ 10 ] = clipPlane.z + 1.0 - clipBias;
		projectionMatrix.elements[ 14 ] = clipPlane.w;

		//
		var currentRenderTarget = renderer.getRenderTarget();
		var gridhelperVis = null;
		if(gridhelper) gridhelperVis = gridhelper.visible;

		var currentVrEnabled = renderer.vr.enabled;
		var currentShadowAutoUpdate = renderer.shadowMap.autoUpdate;

		scope.visible = false;
		if(gridhelper) gridhelper.visible = false;

		renderer.vr.enabled = false; // Avoid camera modification and recursion
		renderer.shadowMap.autoUpdate = false; // Avoid re-computing shadows

		renderer.setRenderTarget( RT );
		renderer.clear();
		renderer.render( scene, mirrorCamera );

		scope.visible = true;
		if(gridhelper) gridhelper.visible = gridhelperVis;

		renderer.vr.enabled = currentVrEnabled;
		renderer.shadowMap.autoUpdate = currentShadowAutoUpdate;
		renderer.setRenderTarget( currentRenderTarget );
	};
};


THREE.WaterNice.prototype = Object.create( THREE.Mesh.prototype );
THREE.WaterNice.prototype.constructor = THREE.WaterNice;
