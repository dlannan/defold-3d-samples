

        
function oceanUnderwater( node, geometry ) {        

    var waterNormals = new THREE.TextureLoader().load( '/user/pages/assets/environments/maritime-ocean/Waterbump.png', function ( texture ) {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    });

    var floorMaterial = {
        waterNormals: waterNormals,
        tDiffuse: node.material.map,
        sunDirection: dirLight.position.clone().normalize(),
        sunColor: 0xffffff
    };

    //console.log(node);
    if(geometry == undefined) geometry = node.geometry.clone();
    var oceanObj = new THREE.WaterUnderwater( geometry, floorMaterial );
    //oceanFloor.rotation.x = - Math.PI * 0.5;   
    node.parent.add(oceanObj);
    return oceanObj;
}


THREE.WaterUnderwater = function ( geometry, options ) {

	THREE.Mesh.call( this, geometry );
	
    geometry.computeFaceNormals();
    geometry.computeVertexNormals();
    THREE.BufferGeometryUtils.computeTangents( geometry );

	var scope = this;

	options = options || {};
	var fog = options.fog !== undefined ? options.fog : false;
    var normalSampler = options.waterNormals !== undefined ? options.waterNormals : null;
    var tDiffuse = options.tDiffuse !== undefined ? options.tDiffuse : null;
    var side = options.side !== undefined ? options.side : THREE.DoubleSide;
    
    var underwaterShader = {

		uniforms: THREE.UniformsUtils.merge( [
			THREE.UniformsLib[ 'fog' ],
			THREE.UniformsLib[ 'lights' ],
			{
                normalSampler: { value: null },
                tDiffuse: { value: null },

                WaterLevel: { value: 0.0 },
				Visibility: { value: 28.0 },
				WindDir: { value: new THREE.Vector2(-0.5, -0.8) },
				WindSpeed: { value: 0.6 },
				WaveScale: { value: 1.0 },
				MudExtinction: { value: new THREE.Vector3(0.6, 0.8, 1.0) },
				WaterExtinction: { value: new THREE.Vector3(0.6, 0.8, 1.0) },
				sunTransmittance: { value: new THREE.Vector3() },
				sunFade: { value: 1.0 },
                scatterFade: { value: 1.0 },
                
                sunPos: { value: new THREE.Vector3() },
                sunColor: { value: new THREE.Vector3() },                
                timer: { value: 0.0 }
			}
        ] ),
        
		vertexShader: [

            'varying vec4 worldPosition;',
            'varying vec4 sPosition;',
            'varying vec3 viewDir;',
            'varying vec3 vertex;',
            'varying vec2 vUv;',
            'varying vec3 vNormal;',

			THREE.ShaderChunk[ 'fog_pars_vertex' ],
			THREE.ShaderChunk[ 'shadowmap_pars_vertex' ],

			'vec4 GetScreenPos( vec4 pos ) {',
			' 	vec4 o = pos * 0.5;',
			'	o.xy = vec2(o.x * -1.0, o.y) + o.w;',
			'	o.zw = pos.zw;',
			'	return o;',
			'}',

            'void main() {',
            '   vertex = position;',
            '   vUv = uv;',
            '   vNormal = (modelMatrix * vec4( normal, 1.0 )).xyz;',            
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
        
        'uniform float WaterLevel;',
        'uniform float Visibility;',
        'uniform vec2 WindDir;',
        'uniform float WindSpeed;',
        'uniform float WaveScale;',
        'uniform vec3 MudExtinction;',
        'uniform vec3 WaterExtinction;',
        'uniform vec3 sunTransmittance;',
        'uniform float sunFade;',
        'uniform float scatterFade;',

        'uniform sampler2D normalSampler;',
        'uniform sampler2D tDiffuse;',

        'uniform vec3 sunColor;',
        'uniform vec3 sunPos;',
        'uniform float timer;',

        'varying vec4 worldPosition;',
        'varying vec4 sPosition;',
        'varying vec3 viewDir;',
        'varying vec3 vertex;',
        'varying vec2 vUv;',

        'varying vec3 vNormal;',

        '',
        THREE.ShaderChunk[ 'common' ],
        THREE.ShaderChunk[ 'packing' ],
        THREE.ShaderChunk[ 'bsdfs' ],
        THREE.ShaderChunk[ 'fog_pars_fragment' ],
        THREE.ShaderChunk[ 'lights_pars_begin' ],
        THREE.ShaderChunk[ 'shadowmap_pars_fragment' ],
        THREE.ShaderChunk[ 'shadowmask_pars_fragment' ],
        '',
        'vec3 intercept(vec3 lineP, vec3 lineN, vec3 planeN, float  planeD)',
        '{',
        '  ',
        '	float distance = (planeD - dot(planeN, lineP)) /dot(lineN, planeN);',
        '	return lineP + lineN * distance;',
        '}',
        '',
        'vec3 perturb(sampler2D tex, vec2 coords, float bend)',
        '{',
            'vec3 col = vec3(0);',
            '',
            'vec2 windDir = WindDir;',
            'float windSpeed = WindSpeed;',
            'float scale = WaveScale;',
            '',
            '// might need to swizzle, not sure',
            'vec2 nCoord = coords * (scale * 0.04) + windDir * timer * (windSpeed * 0.03);',
            'col += texture2D(tex, nCoord + vec2(-timer * 0.005, -timer * 0.01)).rgb * 0.20;',
            '',
            'nCoord = coords * (scale * 0.1) + windDir * timer * (windSpeed * 0.05) - (col.xy / col.z) * bend;',
            'col += texture2D(tex, nCoord + vec2(+timer * 0.01, +timer * 0.005)).rgb * 0.20;',
            '',
            'nCoord = coords * (scale * 0.25) + windDir * timer * (windSpeed * 0.1) - (col.xy / col.z) * bend;',
            'col += texture2D(tex, nCoord + vec2(-timer * 0.02, -timer * 0.03)).rgb * 0.20;',
            '',
            'nCoord = coords * (scale * 0.5) + windDir * timer * (windSpeed * 0.2) - (col.xy / col.z) * bend;',
            'col += texture2D(tex, nCoord + vec2(+timer * 0.03, +timer * 0.02)).rgb * 0.15;',
            '',
            'nCoord = coords * (scale * 1.0) + windDir * timer * (windSpeed * 1.0) - (col.xy / col.z) * bend;',
            'col += texture2D(tex, nCoord + vec2(+timer * 0.03, +timer * 0.02)).rgb * 0.15;',
            '',
            'nCoord = coords * (scale * 2.0) + windDir * timer * (windSpeed * 1.3) - (col.xy / col.z) * bend;',
            'col += texture2D(tex, nCoord + vec2(+timer * 0.03, +timer * 0.02)).rgb * 0.15;',
            '',
            'return col;',
        '}',
        '',
        'void main() {',
        '',
        'vec3 vVec = normalize(viewDir);',
		'',
        'float waterSunGradient = dot(vVec, sunPos.xyz);',
        'waterSunGradient = max(pow(waterSunGradient * 0.7 + 0.3, 2.0), 0.0);',
        '',
        'float waterGradient = dot(vVec, vec3(0.0, -1.0, 0.0));',
        'waterGradient = clamp((waterGradient * 0.5 + 0.5), 0.2, 1.0);',
        '',
        'vec3 waterSunColor = vec3(0.0, 1.0, 0.85) * waterSunGradient;',
        '',
        'bool aboveWater = cameraPosition.y > WaterLevel;',
        '',
        'waterSunColor = aboveWater ? waterSunColor * 0.25 : waterSunColor * 0.5;',
        '',
        'vec3 waterColor = (vec3(0.0078, 0.5176, 0.700) + waterSunColor) * waterGradient * 1.5;',
        'vec3 fragCoord = vec3(vertex.xyz);',
        'vec2 TexCoord = vUv;',

        'vec3 waterEyePos = intercept(worldPosition.xyz, vVec, vec3(0.0, 1.0, 0.0), WaterLevel);',
        'vec3 diffuse = texture2D(tDiffuse, vUv).rgb;     ',
        'float NdotL = max(dot(vNormal, sunPos.xyz), 0.0);',
        'vec3 sunLight = sunColor * NdotL * sunFade;',
        '',
        '// sky illumination',
        'float skyBright = max(dot(vNormal, vec3(0.0, 1.0, 0.0)) * 0.5 + 0.5, 0.0);',
        'vec3 skyLight = mix(vec3(1.0, 0.5, 0.0) * 0.05, vec3(0.2, 0.5, 1.0) * 1.5, sunTransmittance);',
        'skyLight *= skyBright;',
        '',
        '// ground illumination',
        'float groundBright = max(dot(vNormal, vec3(0.0, -1.0, 0.0)) * 0.5 + 0.5, 0.0);   ',
        'float sunLerp = clamp(1.0 - exp(-sunPos.y), 0.0, 1.0);',
        'vec3 groundLight = vec3(.3 * sunLerp);',
        'groundLight *= groundBright;',
        '',
        'vec3 EV = vVec;',
        'float underwaterFresnel = pow( clamp(1.0 - dot(vNormal, EV), 0.0, 1.0 ), 2.0 ) * sunLerp;',
        '',
        '// water color',
        'float topfog = length(waterEyePos - worldPosition.xyz) / Visibility;',
        'topfog = clamp(topfog, 0.0, 1.0);',
        '',
        'float viewDepth = length(viewDir);',
        '',
        'float underfog = viewDepth / Visibility;',
        'underfog = clamp(underfog, 0.0, 1.0);',
        '',
        'float depth = waterEyePos.y - worldPosition.y; // water depth',
        '',
        'float far = viewDepth / 1000.0;',
        'float shorecut = aboveWater ? smoothstep(-0.001, 0.001, depth) : smoothstep(-5.0 * max(far, 0.0001), -4.0 * max(far, 0.0001), depth);',
        'float shorewetcut = smoothstep(-0.18, -0.000, depth + 0.01);',
        '',
        'depth /= Visibility;',
        'depth = clamp(depth, 0.0, 1.0);',
        '',
        'float fog = aboveWater ? topfog : underfog;',
        'fog *= shorecut;',
        '',
        'float darkness = Visibility * 1.5;',
        'darkness = mix(1.0, clamp((cameraPosition.y + darkness) / darkness, 0.0, 1.0), shorecut);',
        '',
        'float fogdarkness = Visibility * 2.0;',
        'fogdarkness = mix(1.0, clamp((cameraPosition.y + fogdarkness) / fogdarkness, 0.0, 1.0), shorecut) * scatterFade;',
        '',
        '// caustics',
        'vec3 causticPos = intercept(worldPosition.xyz, sunPos.xyz, vec3(0.0, 1.0, 0.0), WaterLevel);',
        'float causticdepth = length(causticPos - worldPosition.xyz); // caustic depth',
        'causticdepth = 1.0 - clamp(causticdepth / Visibility, 0.0, 1.0);',
        'causticdepth = clamp(causticdepth, 0.0, 1.0);',
        '',
        'vec3 normalMap = perturb(normalSampler, causticPos.xz, causticdepth) * 2. - 1.;',
        'normalMap = normalMap.xzy;',
        'normalMap.xz *= -1.;',
        'vec3 causticnorm = normalMap;',
        '',
        'float fresnel = pow(clamp(dot(sunPos.xyz, causticnorm), 0.0, 1.0), 2.0); ',
        '',
        'float causticR = 1.0 - perturb(normalSampler, causticPos.xz, causticdepth).z;',
            '',
        'vec3 caustics = vec3(clamp(pow(causticR * 5.5, 5.5 * causticdepth), 0.0, 1.0) * NdotL * sunFade * causticdepth);',
        '',
        '// not yet implemented',
        '//if(causticFringe)',
        '//{',
        '//    float causticG = 1.0-perturb(normalSampler,causticPos.st+(1.0-causticdepth)*aberration,causticdepth).z;',
        '//    float causticB = 1.0-perturb(normalSampler,causticPos.st+(1.0-causticdepth)*aberration*2.0,causticdepth).z;',
        '//    caustics = clamp(pow(vec3(causticR,causticG,causticB)*5.5,vec3(5.5*causticdepth)),0.0,1.0)*NdotL*sunFade*causticdepth;',
        '//}',
        '',
        'vec3 underwaterSunLight = vec3(clamp((sunLight + 0.9) - (1.0 - caustics), 0.0, 1.0)) * causticdepth + (sunLight * caustics);',

        'underwaterSunLight = mix(underwaterSunLight, underwaterSunLight * waterColor, clamp((1.0 - causticdepth) / WaterExtinction, 0.0, 1.0));',
        'vec3 waterPenetration = clamp(depth / WaterExtinction, 0.0, 1.0);',
        'skyLight = mix(skyLight, skyLight * waterColor, waterPenetration);',
        'groundLight = mix(groundLight, groundLight * waterColor, waterPenetration);',
        '',
        'sunLight = mix(sunLight, mix(underwaterSunLight , (waterColor * 0.8 + 0.4) * sunFade, underwaterFresnel), shorecut);',
        '',
        'vec3 color = vec3(sunLight + skyLight * 0.7 + groundLight * 0.8) * darkness;',
        '',
        'waterColor = mix(waterColor * 0.3 * sunFade, waterColor, sunTransmittance);',
        '',
        'vec3 fogging = mix((diffuse * 0.2 + 0.8) * mix(vec3(1.2, 0.95, 0.58) * 0.8, vec3(1.1, 0.85, 0.5) * 0.8, shorewetcut) * color, waterColor * fogdarkness, saturate(fog / WaterExtinction)); // adding water color fog',

        'gl_FragColor = vec4(fogging, 1);',

        THREE.ShaderChunk[ 'tonemapping_fragment' ],
        THREE.ShaderChunk[ 'fog_fragment' ],

        '}'
        ].join( '\n' )     
    };

    var material = new THREE.ShaderMaterial( {
        fragmentShader: underwaterShader.fragmentShader,
        vertexShader: underwaterShader.vertexShader,
        uniforms: THREE.UniformsUtils.clone( underwaterShader.uniforms ),
        transparent: false,
        lights: true,
        side: side,
        fog: fog
    } );
    
    material.uniforms.normalSampler.value = normalSampler;
    scope.material = material;
};

THREE.WaterUnderwater.prototype = Object.create( THREE.Mesh.prototype );
THREE.WaterUnderwater.prototype.constructor = THREE.WaterUnderwater;
