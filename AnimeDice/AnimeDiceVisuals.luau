--!nocheck
-- NaruHub | AnimeDice Visuals Module v1.0.0
-- Separate loadstring: extracts gradient colors, modelName, shirtId from unit configs.

local function color3ToHex(c)
	return string.format("#%02X%02X%02X",
		math.floor(c.R * 255 + 0.5),
		math.floor(c.G * 255 + 0.5),
		math.floor(c.B * 255 + 0.5))
end

local function gradientToHexArray(gradient)
	if typeof(gradient) ~= "ColorSequence" then return nil end
	local seen = {}
	local colors = {}
	for _, kp in ipairs(gradient.Keypoints) do
		local hex = color3ToHex(kp.Value)
		if not seen[hex] then
			seen[hex] = true
			table.insert(colors, hex)
		end
	end
	return colors
end

local function getShirtId(model)
	if not model then return nil end
	local shirt = model:FindFirstChildOfClass("Shirt")
	if shirt and shirt.ShirtTemplate ~= "" then
		return shirt.ShirtTemplate:match("(%d+)")
	end
	return nil
end

local function enrichUnit(cfg)
	if not cfg then return nil, nil, nil end
	return gradientToHexArray(cfg.gradient),
		cfg.baseModel and cfg.baseModel.Name or nil,
		getShirtId(cfg.baseModel)
end

local function enrichSlot(cfg)
	if not cfg then return nil, nil end
	return gradientToHexArray(cfg.gradient),
		cfg.baseModel and cfg.baseModel.Name or nil
end

return {
	enrichUnit = enrichUnit,
	enrichSlot = enrichSlot,
}
